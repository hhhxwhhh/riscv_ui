export interface StageInfo {
    id: string;
    name: string;
    description: string;
    statusText: string;
    standardInstructions: string[];
    customInstructions: {
        text: string;
        mappedStandardIdxs: number[];
        detail: string;
    }[];
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
            {
                text: 'LKEY    k0, 0(secure)    # HW Root Key',
                mappedStandardIdxs: [0, 1],
                detail: '硬件加载根密钥，代替软件密钥加载和设备ID获取。'
            },
            {
                text: 'RISCV.SM2.SIGN a1, k0   # HW SM2 Sign',
                mappedStandardIdxs: [2, 3, 4],
                detail: '硬件SM2签名，代替挑战种子、哈希混合和移位掩码。'
            },
            {
                text: 'RISCV.SM2.VER  a2, a1   # HW SM2 Verify',
                mappedStandardIdxs: [5, 6, 7, 8],
                detail: '硬件SM2验签，代替软件验签和公钥加载。'
            },
            {
                text: 'CVAL.ID  a0, a2         # Validate ID',
                mappedStandardIdxs: [9, 10],
                detail: '硬件ID校验，代替软件ECC乘法和结果检查。'
            },
            {
                text: '# Fast Path Complete',
                mappedStandardIdxs: [],
                detail: '快速路径完成，无需多步软件循环。'
            },
            {
                text: '# One Cycle Auth',
                mappedStandardIdxs: [],
                detail: '单周期认证，极大提升效率。'
            }
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
            {
                text: 'LD      a0, 0(packet)    # Load 64-bit Chunk',
                mappedStandardIdxs: [0],
                detail: '一次性加载数据块，简化分步加载。'
            },
            {
                text: 'LKEY    k1, 0(key_reg)   # Load SM4 Key',
                mappedStandardIdxs: [1],
                detail: '硬件密钥加载，代替软件密钥处理。'
            },
            {
                text: 'RISCV.SM4.ENC a0, a0, k1 # HW SM4 Step',
                mappedStandardIdxs: [2, 3, 4, 5],
                detail: '硬件加密一步到位，代替多轮软件加密。'
            },
            {
                text: 'SD      a0, 0(out)       # Store to DMA',
                mappedStandardIdxs: [8],
                detail: '直接存储加密结果，简化存储流程。'
            },
            {
                text: '# Parallel Cipher Active',
                mappedStandardIdxs: [6, 7],
                detail: '并行加密，提升性能。'
            },
            {
                text: '# Multi-Core Pipeline',
                mappedStandardIdxs: [],
                detail: '多核流水线加速。'
            }
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
            {
                text: 'LD      a0, 0(cipher)    # Load Cipher Block',
                mappedStandardIdxs: [0],
                detail: '一次性加载密文块，简化分步加载。'
            },
            {
                text: 'LKEY    k1, 0(key_reg)   # Load SM4 Key',
                mappedStandardIdxs: [1],
                detail: '硬件密钥加载，代替软件密钥处理。'
            },
            {
                text: 'RISCV.SM4.DEC a0, a0, k1 # HW SM4 Decrypt',
                mappedStandardIdxs: [2, 3, 4, 5],
                detail: '硬件解密一步到位，代替多轮软件解密。'
            },
            {
                text: 'SD      a0, 0(plain)     # Store to Memory',
                mappedStandardIdxs: [8],
                detail: '直接存储解密结果，简化存储流程。'
            },
            {
                text: '# Inverse Cipher Fast',
                mappedStandardIdxs: [6, 7],
                detail: '逆向加密快速完成。'
            },
            {
                text: '# Low Latency Dec',
                mappedStandardIdxs: [],
                detail: '低延迟解密。'
            }
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
            {
                text: 'LD      a1, 0(data)      # Load Data Ptr',
                mappedStandardIdxs: [0],
                detail: '一次性加载数据指针，简化分步加载。'
            },
            {
                text: 'RISCV.SM3.INIT          # Init SM3 Engine',
                mappedStandardIdxs: [1],
                detail: '硬件初始化哈希引擎，代替软件累加。'
            },
            {
                text: 'RISCV.SM3.UPDATE a1, 64 # HW Batch Hash',
                mappedStandardIdxs: [2, 3, 4, 5],
                detail: '硬件批量哈希，代替多步软件循环。'
            },
            {
                text: 'RISCV.SM3.FINISH a0     # Get Digest',
                mappedStandardIdxs: [6, 7],
                detail: '硬件获取哈希结果，代替软件收尾。'
            },
            {
                text: '# Atomic Integrity',
                mappedStandardIdxs: [],
                detail: '原子性完整性校验。'
            },
            {
                text: '# Integrity Verified',
                mappedStandardIdxs: [],
                detail: '完整性已验证。'
            }
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
