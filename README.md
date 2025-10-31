# ⚡ BlockSub — Web3 Recurring Payments Reinvented  

> **The Stripe for Solana** — Seamless, secure, and programmable recurring payments powered by on-chain automation.  
 

---

## 🌍 Overview  

BlockSub is a **Web3-native subscription infrastructure** built on **Solana**, enabling developers and businesses to easily integrate **recurring, on-chain payments** into their apps — just like Stripe Subscriptions, but decentralized.  

With BlockSub, merchants can collect periodic payments, manage customer lifecycles, and trigger automated actions **without storing private keys or compromising user custody.**  

---

## 💡 Why BlockSub?  

| 🧩 Problem | 🚀 Solution |
|-------------|-------------|
| Subscription-based businesses rely on Web2 processors (Stripe, PayPal) with high fees, custody risk, and no crypto-native flows. | BlockSub offers trustless, low-fee recurring payments directly on Solana. |
| On-chain payments lack a reliable way to handle monthly or periodic billing. | BlockSub introduces relayer-based verified billing cycles with HMAC-secured callbacks. |
| Developers face complex smart contract setups. | Our plug-and-play REST API + demo relayer makes it as simple as `POST /create-subscription`. |

---

## ⚙️ How It Works  

1. **Merchant connects wallet** to BlockSub dashboard.  
2. **Customer subscribes** — a `PaymentOrder` is created and mapped to a recurring subscription.  
3. **Merchant Relayer** signs and confirms transactions securely via HMAC.  
4. **Payment Worker** processes signed orders, updates statuses, and triggers webhooks.  

### 🧠 Architecture Overview  
Merchant App → BlockSub API → Payment Worker → Relayer → Solana Network
↘ Webhooks / Dashboards ↙

---


---

## 🔐 Security Highlights  

- 🔑 **Per-subscription HMAC secrets** for relayer verification  
- 🛡️ **No key custody** — merchants retain full control  
- 🌀 **Replay protection** via timestamps & idempotency keys  
- 🔒 **AES-256 encryption** for sensitive data  
- 🔑 **JWT + Refresh Tokens** for secure session management  

---

## 🧰 Tech Stack  

- **Backend:** Node.js (Express) + MongoDB + Drizzle ORM  
- **Blockchain:** Solana Web3.js + Anchor + Helius RPC  
- **Relayer:** Custom signer for decentralized billing automation  
- **Frontend:** React (Vite) + Tailwind + Framer Motion  
- **Security:** HMAC verification, AES encryption, JWT auth  

---

## 💼 Key Features  

✅ Fully automated recurring crypto payments (USDC / any SPL token)  
✅ Non-custodial relayer system (merchant-controlled)  
✅ Real-time subscription tracking + analytics  
✅ REST API & webhook-based integration  
✅ Merchant dashboard for insights  
✅ Stripe-like UX — but decentralized  

---

## 🧩 Integrations  

| Platform | Status |
|-----------|---------|
| 🪙 **Solana Devnet** | ✅ Active |
| 🧰 **MongoDB Atlas** | ✅ Integrated |
| 🪄 **Nodemailer (SMTP)** | ✅ Working |
| 🔗 **Phantom Wallet** | ✅ Supported |
| 🧱 **Helius RPC** | ✅ Connected |
| ⚙️ **Anchor Smart Contracts** | 🔜 Mainnet Jan 2026 |

---

## 🧭 Roadmap (as of October 2025)  

| Phase | Milestone | Status |
|--------|------------|--------|
| 🚀 Jan 2026 | Mainnet Deployment — *Full-scale release on Solana Mainnet* | 🔜 Coming Soon |
| 🌍 After Jan 2026 | Global Launch + Merchant SDK + Cross-chain Expansion | 🧭 On the Horizon |
| 🏗️ Feb 2026 | API + Worker + Relayer MVP — *Core system deployed on Devnet* | ✅ Partial Implemented |
| ⚡ March 2026 | Web Dashboard + Analytics — *Merchant dashboard live with insights* | ✅ Completed |
| 🪙 June 2026 | Tokenomics + Staking System — *Reward & loyalty model under development* | ⏳ In Progress |

---

## 🧑‍💻 Founder  

**Shaheer Ali** — Founder & Lead Engineer @ BlockSub  
🚀 Building decentralized fintech from the ground up.  
💬 [Twitter (X)](https://x.com/ray_shaheer_ali)  
🌐 [Website](https://blocksub-public-1.onrender.com)  
💻 [GitHub](https://github.com/shaheer-ali-dev/Blocksub)

---

## ⚙️ How to Run Locally  

### 🧩 Requirements
- Node.js ≥ 20.x  
- MongoDB (local or Atlas)  
- Solana CLI (for on-chain testing)  
- Phantom Wallet (for dApp testing)

### 🔧 Setup  

```bash
# 1️⃣ Clone the repo
git clone https://github.com/shaheer-ali-dev/Blocksub.git
cd Blocksub

# 2️⃣ Install dependencies
npm install

# 3️⃣ Configure environment
cp .env.example .env
# then fill in your MongoDB URI, RPC endpoint, JWT secret, etc.

# 4️⃣ Run development server
npm run dev

# 5️⃣ Start the background worker
npm run start-worker
