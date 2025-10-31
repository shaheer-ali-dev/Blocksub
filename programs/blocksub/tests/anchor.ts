i  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Blocksub as anchor.Program<Blocksub>;
  
mport * as anchor from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Blocksub } from "../target/types/blocksub";

async function main() {
  console.log("🚀 Starting BlockSub Demo...");

  // --- Setup connection & wallets ---
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "processed"
  );
  const subscriber = Keypair.generate();
  const merchant = Keypair.generate();

  console.log("Subscriber:", subscriber.publicKey.toBase58());
  console.log("Merchant:", merchant.publicKey.toBase58());

  // Airdrop some SOL to subscriber for demo
  let sig = await connection.requestAirdrop(
    subscriber.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig, "processed");
  console.log("💰 Airdropped 2 SOL to subscriber");

  // --- Create PDA ---
  const PROGRAM_ID = new PublicKey(
    "2md8utuDnYAiMNysT2b9NMXPdceS4D6RCXHio1XfeWHU"
  );
  const [subscriptionPda, bump] = await PublicKey.findProgramAddress(
    [
      Buffer.from("subscription"),
      merchant.publicKey.toBuffer(),
      subscriber.publicKey.toBuffer(),
    ],
    PROGRAM_ID
  );

  console.log("Subscription PDA:", subscriptionPda.toBase58());

  // --- Send a simple transfer as a placeholder for initialize ---
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: subscriber.publicKey,
      toPubkey: merchant.publicKey,
      lamports: 0.01 * LAMPORTS_PER_SOL, // demo payment
    })
  );

  await sendAndConfirmTransaction(connection, tx, [subscriber]);
  console.log("✅ Demo payment sent");

  console.log("🎉 Demo complete!");
}

main().catch(console.error);
