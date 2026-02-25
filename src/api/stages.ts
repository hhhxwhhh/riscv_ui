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
        description: 'Mutual device authentication based on SM2 algorithm. Verifies device legitimacy and establishes secure trust.',
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
                detail: 'Hardware loads the root key, replacing software key loading and ID retrieval.'
            },
            {
                text: 'RISCV.SM2.SIGN a1, k0   # HW SM2 Sign',
                mappedStandardIdxs: [2, 3, 4],
                detail: 'Hardware SM2 signing, replacing challenge seed processing, hash mixing, and masking.'
            },
            {
                text: 'RISCV.SM2.VER  a2, a1   # HW SM2 Verify',
                mappedStandardIdxs: [5, 6, 7, 8],
                detail: 'Hardware SM2 verification, replacing software signature verification and public key loading.'
            },
            {
                text: 'CVAL.ID  a0, a2         # Validate ID',
                mappedStandardIdxs: [9, 10],
                detail: 'Hardware ID validation, replacing software ECC multiplication and result checks.'
            },
            {
                text: '# Fast Path Complete',
                mappedStandardIdxs: [],
                detail: 'Fast path completed without multi-step software loops.'
            },
            {
                text: '# One Cycle Auth',
                mappedStandardIdxs: [],
                detail: 'Single-cycle authentication, significantly improving efficiency.'
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
  // Complex software ECC multiplication implementation
  point_t pub = load_public_key(dev->id);
  signature_t sig = receive_signature();
  
  // Software calculation takes a very long time
  if (software_ecc_verify(&pub, &sig) == VALID) {
    return 1;
  }
  return 0;
}`,
            asm: `verify_device_hw:
  lkey  k0, 0(secure_mem)  # Load root key
  lbuf  a0, 0(input_ptr)   # Load signature data
  # Use RISC-V SM2 instructions
  riscv.sm2.verify a1, a0, k0
  ret`
        }
    },
    {
        id: 'ENCRYPT',
        name: 'Encryption',
        description: 'Gateway encrypts data using SM4-HW algorithm based on custom RISC-V extensions. Drastically reduces CPU load.',
        statusText: 'HW ENCRYPTING PAYLOAD',
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
                detail: 'Loads data blocks in one go, simplifying incremental loading.'
            },
            {
                text: 'LKEY    k1, 0(key_reg)   # Load SM4 Key',
                mappedStandardIdxs: [1],
                detail: 'Hardware key loading, replacing software key processing.'
            },
            {
                text: 'RISCV.SM4.ENC a0, a0, k1 # HW SM4 Step',
                mappedStandardIdxs: [2, 3, 4, 5],
                detail: 'Hardware encryption in one step, replacing multi-round software encryption.'
            },
            {
                text: 'SD      a0, 0(out)       # Store to DMA',
                mappedStandardIdxs: [8],
                detail: 'Stores encryption results directly to DMA, simplifying output flow.'
            },
            {
                text: '# Parallel Cipher Active',
                mappedStandardIdxs: [6, 7],
                detail: 'Parallel encryption active, boosts performance.'
            },
            {
                text: '# Multi-Core Pipeline',
                mappedStandardIdxs: [],
                detail: 'Multi-core pipeline acceleration.'
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
  sm4_key_setup(key, rk); // Software key expansion
  for (int i=0; i<32; i++) {
    // Software simulation of 32 rounds
    plain[0] = sm4_f(plain[0], rk[i]);
  }
}`,
            asm: `encrypt_sm4_hw:
  lkey    k1, 0(key_reg)
  vle32.v v0, (a0)         # Vector load
  # RISC-V Cryptography Extensions
  vsm4e.vv v0, v1, k1
  vse32.v v0, (a1)
  ret`
        }
    },
    {
        id: 'DECRYPT',
        name: 'Decryption',
        description: 'Real-time decryption at the gateway side. Restores confidential data from IoT terminals into processable formats.',
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
                detail: 'Loads ciphertext blocks in one go.'
            },
            {
                text: 'LKEY    k1, 0(key_reg)   # Load SM4 Key',
                mappedStandardIdxs: [1],
                detail: 'Hardware key loading, replacing software key processing.'
            },
            {
                text: 'RISCV.SM4.DEC a0, a0, k1 # HW SM4 Decrypt',
                mappedStandardIdxs: [2, 3, 4, 5],
                detail: 'Hardware decryption in one step, replacing 32 software rounds.'
            },
            {
                text: 'SD      a0, 0(plain)     # Store to Memory',
                mappedStandardIdxs: [8],
                detail: 'Directly store decrypted results to memory.'
            },
            {
                text: '# Inverse Cipher Fast',
                mappedStandardIdxs: [6, 7],
                detail: 'Inverse decryption completed rapidly.'
            },
            {
                text: '# Low Latency Dec',
                mappedStandardIdxs: [],
                detail: 'Low latency decryption active.'
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
    // Requires 32 software iterations
    cipher[0] = sm4_f(cipher[0], rk[i]);
  }
}`,
            asm: `decrypt_sm4_hw:
  lkey    k1, 0(key_reg)
  riscv.sm4.dec a0, a0, k1 # Hardware single-cycle decryption
  sd      a0, 0(a1)
  ret`
        }
    },
    {
        id: 'HASH',
        name: 'Hash',
        description: 'Calculates SM3 hash. Verifies the integrity of decrypted business data to ensure no tampering occurred.',
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
                detail: 'Loads data pointer once.'
            },
            {
                text: 'RISCV.SM3.INIT          # Init SM3 Engine',
                mappedStandardIdxs: [1],
                detail: 'Hardware initializes SM3 engine, replacing software accumulation.'
            },
            {
                text: 'RISCV.SM3.UPDATE a1, 64 # HW Batch Hash',
                mappedStandardIdxs: [2, 3, 4, 5],
                detail: 'Hardware batch processing, replacing software loops.'
            },
            {
                text: 'RISCV.SM3.FINISH a0     # Get Digest',
                mappedStandardIdxs: [6, 7],
                detail: 'Hardware retrieves result, replacing software finalize.'
            },
            {
                text: '# Atomic Integrity',
                mappedStandardIdxs: [],
                detail: 'Atomic integrity validation.'
            },
            {
                text: '# Integrity Verified',
                mappedStandardIdxs: [],
                detail: 'Integrity successfully verified.'
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
    // Software shift, XOR, accumulate
    hash = ((hash << 5) + hash) + data[i];
  }
  return hash;
}`,
            asm: `compute_sm3_hw:
  riscv.sm3.init
  riscv.sm3.update v0, a0, a1 # HW accelerated compression
  riscv.sm3.finish a0
  ret`
        }
    }
];
