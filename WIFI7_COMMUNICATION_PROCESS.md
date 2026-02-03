# Wi-Fi 7 (IEEE 802.11be) 通信过程、协议与算法分析

## 1. 概述

Wi-Fi 7，技术标准名称为 **IEEE 802.11be EHT (Extremely High Throughput)**，旨在提供相比 Wi-Fi 6/6E 更高的数据传输速率（理论峰值达 46 Gbps）、更低的延迟和更高的频谱效率。它主要面向 8K 视频流、AR/VR/XR、工业物联网等对带宽 and 延迟极其敏感的应用场景。

---

## 2. 通信过程 (Communication Process)

Wi-Fi 7 的通信过程在继承 802.11 传统流程的基础上，针对“多链路”和“大带宽”进行了深度优化。

### 2.1 连接建立 (Association & MLO Setup)

传统的 Wi-Fi 连接建立在单一频段（如 2.4GHz 或 5GHz）上。Wi-Fi 7 引入了核心特性 **MLO (Multi-Link Operation，多链路操作)**。

**发现阶段 (Discovery)**: 支持 MLO 的 AP (Access Point) 会在 Beacon 帧中携带 "Reduced Neighbor Report" 或 "Basic Variant Multi-Link" 元素，告知 STA (Station) 设备其支持的所有链路（如 2.4G+5G+6G）。
**关联与认证 (Association & Auth)**: STA 与 AP 进行一次认证和关联过程，即可同时在多个频段上建立逻辑连接。双方协商 MLO 能力（例如是支持同时收发 STR，还是非同时收发 NSTR）。

### 2.2 信道接入与竞争 (Channel Access)

* **CSMA/CA 机制**: 依然基于载波监听多路访问/冲突避免机制。
* **前导码打孔 (Preamble Puncturing)**: 在 Wi-Fi 7 中，如果 320MHz 或 160MHz 宽信道中的某一部分（如 20MHz）被雷达或其他干扰源占用，设备不需要回退到窄信道，而是可以“打孔”屏蔽掉受干扰的频段，利用剩余的非连续频谱进行传输。
* **MLO 接入**: MLO 设备可以监控多个链路的状态。如果链路 A 忙，可以立即切换到链路 B 发送数据，极大降低了等待延迟。

### 2.3 数据传输 (Data Transmission)

*   **物理层处理 (PHY Processing)**: 数据经过扰码、编码 (LDPC)、交织、调制 (4096-QAM)，映射到子载波上。
*   **多天线发送**: 利用 16x16 MIMO 技术，通过空间流 (Spatial Streams) 并行发送不仅增加吞吐量，还利用波束成形 (Beamforming) 增强信号。
*   **OFDMA**: 将频谱资源划分为 RU (Resource Units)。Wi-Fi 7 允许 **Multi-RU**，即一个用户可以被分配多个 RU 块，极大提升了频谱利用灵活性。

### 2.4 确认与反馈 (Acknowledgment & Feedback)

*   **Block ACK**: 接收端对聚合帧进行批量确认。
*   **CSI 反馈**: 接收端测量信道状态信息 (CSI) 并反馈给发送端，用于下一次传输的波束成形矩阵计算。

---

## 3. 关键协议 (Key Protocols)

Wi-Fi 7 的核心协议栈仍然基于 IEEE 802.11，但在 PHY 和 MAC 层引入了新的子协议和机制。

| 协议层 | 关键技术/协议机制 | 描述 |
| :--- | :--- | :--- |
| **PHY (物理层)** | **IEEE 802.11be PHY** | 定义了 320 MHz 带宽、4096-QAM 调制、EHT 前导码格式。 |
| | **MIMO 协议** | 支持最多 16 条空间流 (16x16 UL/DL MU-MIMO)。 |
| **MAC (介质访问层)** | **MLO (Multi-Link Operation)** | **核心协议**。允许 MAC 层同时控制多个 PHY 链路。数据包可以动态选择最优链路传输，或在多个链路聚合传输。 |
| | **Multi-RU (MRU)** | 增强的 OFDMA 协议，允许将多个资源单元 (Resource Unit) 分配给单个 STA。 |
| | **HARQ (Hybrid ARQ)** | (部分实现/可选) 混合自动重传请求，结合前向纠错和重传，提高可靠性。 |

---

## 4. 涉及的核心算法 (Core Algorithms)

Wi-Fi 7 的性能提升依赖于底层复杂的数字信号处理算法。

### 4.1 调制与解调算法 (Modulation & Demodulation)

*   **对应技术**: 4096-QAM (4K Quadrature Amplitude Modulation)。
*   **算法原理**:
    * **映射算法**: 将 12 bits 数据 ($2^{12} = 4096$) 映射到复平面上的一个星座点。
    * **难点**: 星座点极其密集，对 **EVM (误差矢量幅度)** 要求极高（需低于 -38dB）。
    * **软解调 (Soft De-mapping)**: 接收端计算每个比特的对数似然比 (LLR)，输入给解码器。

### 4.2 信道编码算法 (Channel Coding)

*   **对应技术**: 纠错编码。
*   **算法**: **LDPC (Low-Density Parity-Check, 低密度奇偶校验码)**。
    * Wi-Fi 7 继续沿用且主要依赖 LDPC 码（相比 BCC 卷积码性能更好）。
    * **译码算法**: 通常使用 **置信传播 (Belief Propagation, BP)** 算法或其简化版 **Min-Sum** 算法进行迭代译码，以接近香农极限。

### 4.3 多天线信号处理算法 (MIMO Algorithms)

*   **对应技术**: 16x16 MU-MIMO (多用户多入多出)。
*   **预编码算法 (Pre-coding)** (发送端):
    * **ZF (Zero-Forcing, 迫零)**: 消除用户间干扰。
    * **MMSE (Minimum Mean Square Error, 最小均方误差)**: 在消除干扰和抑制噪声之间取得平衡。
    * 对于 16 根天线，矩阵求逆和分解 (如 SVD 奇异值分解) 的计算复杂度呈立方级增长，需要高效的矩阵运算算法。
*   **信道估计算法 (Channel Estimation)**: 接收端利用前导码 (EHT-LTF) 估算信道矩阵 $H$。

### 4.4 资源调度算法 (Resource Allocation / Scheduling)

*   **对应技术**: OFDMA 和 MLO 调度。
*   **算法 (由芯片厂商实现)**:
    * **MLO 调度**: 动态决定数据包走 2.4G、5G 还是 6G 链路。算法需考虑链路拥塞程度、信噪比 (SNR) 和业务类型 (如低延迟业务优先选 6G)。
    * **RU 分配**: 解决“背包问题”或使用贪婪算法，将不同的 RU (频谱块) 分配给不同用户，以最大化系统总吞吐量或保证公平性。

### 4.5 频谱打孔算法 (Preamble Puncturing Algorithm)

*   **对应技术**: 320MHz 宽带抗干扰。
*   **算法**: 发送端需实时分析信道忙闲位图 (Bitmap)，动态调整发送频谱掩模 (Spectral Mask)，在物理层“关断”受干扰的子载波，只在剩余子载波上发送数据。

---

## 5. 安全与加密涉及的算法 (Security & Cryptography Algorithms)

Wi-Fi 7 强制要求支持 **WPA3 (Wi-Fi Protected Access 3)** 安全标准。相比 WPA2，它引入了更复杂的密码学算法来增强身份验证和数据加密的安全性。

### 5.1 身份认证算法 (Authentication Algorithms)

*   **WPA3-Personal (SAE - Simultaneous Authentication of Equals)**
      * **协议**: SAE (基于 Dragonfly 密钥交换协议)。
    *   **核心算法**:
        *   **ECC (椭圆曲线密码学)**: 通常使用 NIST P-256 (secp256r1) 或 P-384 曲线。
        *   **FFC (有限域密码学)**: 也就是常规的离散对数问题 (Modp groups)，但在 WPA3 中首选 ECC。
        *   **主要机制**: 双方利用共享密码和各自生成的随机数，通过“Commit”和“Confirm”消息交换，利用 **Hash-to-Curve** 算法将密码映射为椭圆曲线上的一个点，从而协商出一个共享的主密钥 (PMK)。
    *   **优势**: 彻底解决了 WPA2 中的 KRACK 密钥重装攻击，并能抵抗离线字典攻击。

*   **WPA3-Enterprise (192-bit Mode / CNSA Suite)**
    *   **协议**: IEEE 802.1X / EAP (Extensible Authentication Protocol)。
    *   **核心算法 (CNSA 套件)**:
        *   **密钥交换**: **ECDH (Elliptic Curve Diffie-Hellman)** 使用 P-384 曲线。
        *   **数字签名**: **ECDSA** (使用 P-384/SHA-384) 或 **RSA** (3072-bit modulus)。
        *   **哈希函数**: **SHA-384** (用于密钥推导)。

### 5.2 数据加密与完整性算法 (Encryption & Integrity)

*   **GCMP-256 (Galois/Counter Mode Protocol)**
    *   **适用场景**: WPA3 企业级 192-bit 模式强制要求，Wi-Fi 7 高吞吐场景推荐。
    *   **核心算法**: **AES-256-GCM**。
        *   **加密 (Confidentiality)**: AES 计数器模式 (Counter Mode)，支持 256 位密钥。
        *   **完整性 (Integrity)**: GMAC (Galois Message Authentication Code)。
    *   **优势**: 相比 CCMP，GCMP 可以并行计算，效率更高，更适合 Wi-Fi 7 的超高带宽 (40Gbps+) 需求。

*   **CCMP-128 (Counter Mode with CBC-MAC Protocol)**
    *   **适用场景**: 向后兼容模式。
    *   **核心算法**: **AES-128-CCM**。
    *   **原理**: 结合了 Counter 模式进行加密和 CBC-MAC 用于完整性校验。

### 5.3 密钥派生算法 (Key Derivation)

*   **算法**: **HKDF (HMAC-based Key Derivation Function)**。
*   **用途**: 从协商的主密钥 (PMK) 中派生出用于加密单播数据的临时密钥 (PTK) 和组播数据的密钥 (GTK)。
*   **具体实现**:
    *   **HMAC-SHA-256**: 用于基础安全级别。
    *   **HMAC-SHA-384**: 用于 192-bit 高安全级别。

### 5.4 管理帧保护 (PMF - Protected Management Frames)

*   **对应协议**: IEEE 802.11w。
*   **算法**:
    *   **BIP-GMAC-256**: 用于广播/组播管理帧的完整性校验 (WPA3 192-bit 模式)。
    *   **BIP-CMAC-128**: 基于 AES-128 的 CMAC 算法 (基础模式)。
*   **作用**: 防止攻击者通过伪造“取消关联 (Deauth)”帧来断开用户的连接。

---

## 6. 物理层帧结构与设计细节 (PHY Frame Structure & Design Details)

Wi-Fi 7 引入了全新的物理层帧格式 **EHT PPDU (Extremely High Throughput PLCP Protocol Data Unit)**。为了向后兼容并支持新特性，其帧结构设计非常复杂。

### 6.1 前导码设计 (Preamble Design)

*   **Legacy Header (L-STF, L-LTF, L-SIG)**: 为了让旧设备（Wi-Fi 4/5/6）能检测到 Wi-Fi 7 信号并“闭嘴”退避，帧头依然保留了传统的非 HT 字段。
*   **RL-SIG (Repeated Legacy SIGNAL)**: 用于自动检测是否为 Wi-Fi 6 (HE) 或 Wi-Fi 7 (EHT) 帧。
*   **U-SIG (Universal SIGNAL field)**: **Wi-Fi 7 新增的核心字段**。
    * **设计目的**: 为了解决未来标准（如 Wi-Fi 8）的兼容性问题，U-SIG 包含版本无关的信息（如 PHY 版本 ID、上下行标识、BSS Color）。
    * **鲁棒性**: 采用极其稳健的调制（BPSK 1/2 编码），确保覆盖范围最远的设备也能解调出基本控制信息。
*   **EHT-SIG (EHT SIGNAL field)**:
    * **内容**: 携带针对用户的具体配置信息，如 MCS (调制编码策略)、RU 分配情况、编码类型 (LDPC) 等。
    * **压缩机制**: 在 MU-MIMO 场景下，使用压缩算法减少信令开销。

### 6.2 色调规划 (Tone Plan) & 320 MHz

*   **FFT 尺寸爆炸**: 320 MHz 带宽需要使用 **4096-point FFT** (而在 Wi-Fi 6 中 160MHz 仅需 2048-point)。这对芯片的 FFT 硬件加速器提出了双倍的算力要求。
*   **保护间隔 (Guard Interval, GI)**: 提供 0.8µs, 1.6µs, 3.2µs 选项，以适应不同的多径延迟环境。

---

## 7. 高级 MAC 层机制深度解析 (Advanced MAC Mechanisms)

### 7.1 MLO 工作模式详解 (MLO Modes)

多链路操作 (Multi-Link Operation) 是 MAC 层的灵魂，但硬件实现有不同复杂度：

*   **STR (Simultaneous Transmit and Receive, 同时收发)**:
    * **机制**: 设备可以在 5GHz 频段发送数据的同时，在 6GHz 频段接收数据。
    * **挑战**: 需要极高的 **频段间隔离度**，防止发送端的强信号“淹没”本地接收端的微弱信号（自干扰）。这通常需要昂贵的滤波器硬件。
*   **NSTR (Non-STR, 非同时收发)**:
    * **机制**: 只能在一个时间点进行发送或接收，不能同时。类似于“半双工”的双链路。
    * **算法约束**: 调度算法需要确保两个链路的时间同步，防止冲突。
*   **EMLSR (Enhanced Multi-Link Single Radio)**:
    * **低成本方案**: 设备平时在所有链路上监听，一旦某条链路赢得竞争开始传输，天线资源立刻全部切换到该链路进行全速传输。
    * **优势**: 允许低成本 IoT 设备利用多链路的“选择分集”优势，而无需两套完整的射频前端。

### 7.2 多 AP 协作 (Multi-AP Coordination)

这是 Wi-Fi 7 (可能在 Release 2 阶段完善) 最大的“大招”，旨在消除 AP 间的干扰。

*   **CSR (Coordinated Spatial Reuse, 协作空间复用)**: AP A 调整发射功率，使得 AP B 可以同时与它的用户通信，互不干扰。基于 **SINR (信干噪比) 对齐算法**。
*   **JXT (Joint Transmission, 联合传输)**: 多个 AP 像蜂窝基站一样，协同向同一个 STA 发送数据。这需要 AP 之间进行纳秒级的时钟同步和极高带宽的后台数据交换。

### 7.3 确定性低延迟 (Deterministic Latency)

*   **R-TWT (Restricted Target Wake Time)**:
    * **机制**: AP 可以预留特定的时间窗口，专供特定设备（如工业机器人）使用，期间禁止其他设备竞争信道。
    * **算法**: 基于 **TDMA (时分多址)** 的思想，将基于竞争的 Wi-Fi 变成了确定性的调度系统。

---

## 8. 数据发送与芯片内部加密流程 (Data Transmission & On-Chip Encryption Flow)

这一部分详细描述从 **OS/驱动层发送数据** 给 Wi-Fi 模块，直到信号 **从天线发出** 的完整流水线，重点展示密码学算法在硬件中的具体执行位置。

### 8.1 阶段一：主机接口与数据搬运 (Host to Chip Transfer)

*   **动作**: 操作系统内核网络栈将数据包（MSDU）通过总线（PCIe/SDIO）传送给 Wi-Fi 芯片的 RAM (DMA 操作)。
*   **数据状态**: **明文 (Plaintext)**。
*   **涉及算法**: 无（纯数据拷贝）。但在高安全场景下（如 WPA3-Enterprise 192-bit），主机驱动可能会先在内存中进行一次预处理，但通常加密由网卡硬件卸载完成。

### 8.2 阶段二：MAC 层加密准备 (MAC Layer Preparation)

数据进入 Wi-Fi 芯片的 MAC 控制器后，开始进行加密前的参数构造。

*   **步骤 1: 抗重放计数器分配 (PN Assignment)**
    * **算法**: **48-bit 递增计数器 (Packet Number)**。
    * **逻辑**: 芯片为每个待发送的数据包分配一个唯一的 48 位 PN。若 PN 耗尽或重置，必须重新协商密钥。
    * **作用**: 防止攻击者截获旧的加密包并重新发送（重放攻击）。

*   **步骤 2: Nonce (随机数/一次性数值) 构造**
    * **算法**: **Nonce Construction Algorithm**。
    * **GCMP 模式 (Wi-Fi 7 推荐)**: $Nonce = A2 (MacAddress) + PN (48bit)$。将发射端 MAC 地址和当前包的 PN 拼接成 96-bit 的 Nonce。
    * **CCMP 模式**: $Nonce = PN + A2 + Priority$。

*   **步骤 3: 附加认证数据构造 (AAD Construction)**
    * **算法**: **AAD Construction**。
    * **逻辑**: 提取 MAC 头部的关键字段（如源/目的 MAC 地址、Frame Control）组成 AAD。
    * **目的**: 这些头部信息虽然不加密（为了路由），但需要 **完整性保护**，防止攻击者篡改地址。

### 8.3 阶段三：硬件加密引擎执行 (Hardware Crypto Engine)

这是发生在 Wi-Fi 芯片内部专用当加密加速器（Crypto Accelerator）中的核心步骤。

#### 场景 A: 采用 AES-GCM (Wi-Fi 7 首选)

*   **1. 密钥流生成 (Keystream Generation)**:
    * **算法**: **AES-CTR (Counter Mode)**。
    * **输入**: 128/256 位 TK (临时密钥) + Nonce。
    * **操作**: AES 引擎生成伪随机密钥流。
*   **2. 数据加密 (Encryption)**:
    * **算法**: **XOR**。
    * **操作**: `密文 = 明文 XOR 密钥流`。
*   **3. 完整性标签计算 (MIC Calculation)**:
    * **算法**: **GHASH (Galois Field Multiplication)**。
    * **输入**: AAD + 密文。
    * **数学基础**: 在 $GF(2^{128})$ 有限域上的多项式乘法。
    * **输出**: 128-bit **MIC (Message Integrity Code)**。

#### 场景 B: 采用 AES-CCM (兼容性)

    * **算法**: 使用 **AES-CBC-MAC** 计算 MIC，然后用 **AES-CTR** 进行加密。相比 GCM，它是串行的，吞吐量较低。

### 8.4 阶段四：物理层封装与发送 (PHY Encapsulation & TX)

加密后的数据（MAC Header + 密文数据 + MIC）被称为 MPDU。

*   **1. 扰码 (Scrambling)**:
    * **算法**: **Scrambling Polynomial** ($S(x) = x^7 + x^4 + 1$)。
    * **目的**: 即使数据全为 0 或 1，也要将其随机化，避免长连 0/1 导致接收端时钟同步丢失。这不是加密，是信号调节。
*   **2. 编码与调制 (Encoding & Modulation)**:
    * LDPC 编码 -> 4096-QAM 映射 -> OFDM 变换。
*   **3. 发射**:
    * 数字信号 -> DAC -> 模拟射频信号 -> 天线发出。

---

## 9. 总结

Wi-Fi 7 不仅仅是速度的提升，其本质是 **通信效率**、**频谱利用率** 和 **安全性** 的全面革命。

* **协议层面**: MLO 打破了频段间的隔阂，U-SIG 为未来标准铺平了道路，R-TWT 让 Wi-Fi 进入了工业控制领域。
* **算法层面**: 4096-QAM 和 16x16 MIMO 将信号处理的复杂度推向了新的高度，对芯片的算力 (DSP) 提出了巨大挑战；而 SAE 和 WPA3-Enterprise 192-bit 模式则筑起了坚固的安全防线。

**文档生成日期**: 2026年1月30日
