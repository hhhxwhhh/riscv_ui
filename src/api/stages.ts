export interface StageInfo {
    id: string;
    name: string;
    description: string;
    statusText: string;
    standardInstructions: string[];
    customInstructions: string[];
    metrics: {
        throughput: number;
        latency: number;
        securityScore: number;
        stdThroughput: number;
        stdLatency: number;
        stdSecurityScore: number;
    };
    flow: {
        source: string;
        target: string;
        label: string;
        // forward: Device -> Gateway, reverse: Gateway -> Device, internal: Gateway processing
        direction: 'forward' | 'reverse' | 'internal';
    };
    fullCode: {
        c: string;
        asm: string;
    };
}

export const STAGES: StageInfo[] = [
    {
        id: 'AUTH',
        name: 'Authentication',
        description: '基于 SM2 算法的设备身份双向认证过程。确认设备合法性，建立安全信任。',
        statusText: 'AUTHENTICATING...',
        flow: { source: 'device', target: 'gateway', label: 'Auth Challenge/Response', direction: 'reverse' },
        standardInstructions: [
            'AUIPC   a0, 0x1          # Load Key Address',
            'LD      a1, 0(a0)        # Get Device ID',
            'LI      t0, 0x55AA       # Challenge Seed',
            'XOR     a1, a1, t0       # Simple Hash Mix',
            'SLLI    t1, a1, 2        # Shift and mask',
            'ANDI    t1, t1, 0xFF     # Prepare Payload',
            'J       verify_signature # Call Software Sign',
            '# Loop Verification',
            'LD      a2, 8(sp)        # Load Remote PubKey',
            'CALL    ecc_point_mul    # Slow Software ECC',
            'BEQ     a0, zero, fail   # Check Result'
        ],
        customInstructions: [
            'LKEY    k0, 0(secure)    # HW Root Key',
            'RISCV.SM2.SIGN a1, k0   # HW SM2 Sign',
            'RISCV.SM2.VER  a2, a1   # HW SM2 Verify',
            'CVAL.ID  a0, a2         # Validate ID',
            '# Fast Path Complete',
            '# One Cycle Auth'
        ],
        metrics: {
            throughput: 850,
            latency: 1.2,
            securityScore: 98,
            stdThroughput: 85,
            stdLatency: 45.5,
            stdSecurityScore: 70
        },
        fullCode: {
            c: `int verify_device(device_t *dev) {
  // 复杂的软件 ECC 乘法实现
  point_t pub = load_public_key(dev->id);
  signature_t sig = receive_signature();
  
  // 软件计算耗时极长
  if (software_ecc_verify(&pub, &sig) == VALID) {
    return 1;
  }
  return 0;
}`,
            asm: `verify_device_hw:
  lkey  k0, 0(secure_mem)  # 加载根密钥
  lbuf  a0, 0(input_ptr)   # 加载待验签数据
  # 使用 RISC-V SM2 指令集
  riscv.sm2.verify a1, a0, k0
  ret`
        }
    },
    {
        id: 'ENCRYPT',
        name: 'Encryption',
        description: '使用 SM4 硬件加速对业务数据进行加密。确保传感器数据在网络中不被窃听。',
        statusText: 'ENCRYPTING PAYLOAD',
        flow: { source: 'device', target: 'gateway', label: 'Secure Data Stream', direction: 'forward' },
        standardInstructions: [
            'LD      a0, 0(packet)    # Load Block',
            'LI      t1, 0x1234       # Key Material',
            'XOR     a0, a0, t1       # Initial Round',
            'SLLI    a1, a0, 4        # Byte Sub',
            'SRLI    a2, a0, 2        # Shift Row',
            'OR      a0, a1, a2       # Mix Column',
            'ADD     t2, t2, 1        # Next Row',
            'BNE     t2, rounds, L1   # Encryption Loop',
            'SD      a0, 0(out)       # Store Encrypted'
        ],
        customInstructions: [
            'LD      a0, 0(packet)    # Load 64-bit Chunk',
            'LKEY    k1, 0(key_reg)   # Load SM4 Key',
            'RISCV.SM4.ENC a0, a0, k1 # HW SM4 Step',
            'SD      a0, 0(out)       # Store to DMA',
            '# Parallel Cipher Active',
            '# Multi-Core Pipeline'
        ],
        metrics: {
            throughput: 980,
            latency: 0.5,
            securityScore: 99,
            stdThroughput: 120,
            stdLatency: 18.2,
            stdSecurityScore: 60
        },
        fullCode: {
            c: `void encrypt_sm4_soft(uint32_t *plain, uint32_t *key) {
  uint32_t rk[32];
  sm4_key_setup(key, rk); // 软件轮密钥生成
  for (int i=0; i<32; i++) {
    // 软件模拟 32 轮加密迭代
    plain[0] = sm4_f(plain[0], rk[i]);
  }
}`,
            asm: `encrypt_sm4_hw:
  lkey    k1, 0(key_reg)
  vle32.v v0, (a0)         # 向量加载
  # RISC-V 向量加解密扩展
  vsm4e.vv v0, v1, k1
  vse32.v v0, (a1)
  ret`
        }
    },
    {
        id: 'DECRYPT',
        name: 'Decryption',
        description: '网关端接收并实时解密。将各物联网终端的机密数据还原为可处理格式。',
        statusText: 'DECRYPTING DATA',
        flow: { source: 'gateway', target: 'gateway', label: 'Gateway Side Processing', direction: 'internal' },
        standardInstructions: [
            'LD      a0, 0(cipher)    # Load Ciphertext',
            'LI      t1, 0x1234       # Key Material',
            'XOR     a0, a0, t1       # Rev Initial Round',
            'SRLI    a1, a0, 4        # Inv Byte Sub',
            'SLLI    a2, a0, 2        # Inv Shift Row',
            'AND     a0, a1, a2       # Inv Mix Column',
            'SUB     t2, t2, 1        # Inv Round Ptr',
            'BNE     t2, zero, L2     # Decryption Loop',
            'SD      a0, 0(plain)     # Store Plaintext'
        ],
        customInstructions: [
            'LD      a0, 0(cipher)    # Load Cipher Block',
            'LKEY    k1, 0(key_reg)   # Load SM4 Key',
            'RISCV.SM4.DEC a0, a0, k1 # HW SM4 Decrypt',
            'SD      a0, 0(plain)     # Store to Memory',
            '# Inverse Cipher Fast',
            '# Low Latency Dec'
        ],
        metrics: {
            throughput: 960,
            latency: 0.6,
            securityScore: 99,
            stdThroughput: 115,
            stdLatency: 19.5,
            stdSecurityScore: 60
        },
        fullCode: {
            c: `void decrypt_sm4_soft(uint32_t *cipher, uint32_t *key) {
  uint32_t rk[32];
  sm4_key_setup_reverse(key, rk);
  for (int i=0; i<32; i++) {
    // 同样需要 32 轮软件循环
    cipher[0] = sm4_f(cipher[0], rk[i]);
  }
}`,
            asm: `decrypt_sm4_hw:
  lkey    k1, 0(key_reg)
  riscv.sm4.dec a0, a0, k1 # 硬件单周期解密指令
  sd      a0, 0(a1)
  ret`
        }
    },
    {
        id: 'HASH',
        name: 'Hash',
        description: '计算 SM3 哈希。验证解密后的业务数据在处理过程中未被篡改，保证可靠性。',
        statusText: 'CALCULATING HASH',
        flow: { source: 'gateway', target: 'internal', label: 'Verified Forwarding', direction: 'forward' },
        standardInstructions: [
            'LD      a1, 0(data)      # Load Word',
            'ADD     t0, t0, a1       # Accumulate',
            'SLLI    t1, a1, 5        # Shift Left',
            'SUB     t0, t0, t1       # Mix Hash',
            'SRLI    t2, a1, 3        # Shift Right',
            'XOR     t0, t0, t2       # XOR Bits',
            'ADDI    a1, a1, 8        # Advance',
            'BNE     a1, end, loop    # Loop Hash'
        ],
        customInstructions: [
            'LD      a1, 0(data)      # Load Data Ptr',
            'RISCV.SM3.INIT          # Init SM3 Engine',
            'RISCV.SM3.UPDATE a1, 64 # HW Batch Hash',
            'RISCV.SM3.FINISH a0     # Get Digest',
            '# Atomic Integrity',
            '# Integrity Verified'
        ],
        metrics: {
            throughput: 1200,
            latency: 0.3,
            securityScore: 95,
            stdThroughput: 150,
            stdLatency: 12.5,
            stdSecurityScore: 50
        },
        fullCode: {
            c: `uint32_t simple_hash(uint8_t *data, int len) {
  uint32_t hash = 0;
  for (int i=0; i<len; i++) {
    // 软件循环移位、异或、累加
    hash = ((hash << 5) + hash) + data[i];
  }
  return hash;
}`,
            asm: `compute_sm3_hw:
  riscv.sm3.init
  riscv.sm3.update v0, a0, a1 # 硬件加速压缩函数
  riscv.sm3.finish a0
  ret`
        }
    }
];
