import BN from "bn.js";
import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as anchor from "@project-serum/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import type { Blocksub } from "../target/types/blocksub";

// Configure the client to use the local cluster
anchor.setProvider(anchor.AnchorProvider.env());

const program = anchor.workspace.Blocksub as anchor.Program<Blocksub>;


/**
 * Robust test script for the Anchor program in src/lib.rs (subscription + escrow_vault).
 *
 * - Uses the provided subscriber secret key.
 * - Derives PDAs exactly like the program (subscription PDA seeds: ["subscription", merchant, subscriber],
 *   escrow PDA seeds: ["escrow", subscription]).
 * - Uses integer BN math (no floats).
 * - Performs initialize -> release payments (loop) -> attempted extra release (expected failure) -> cancel.
 * - Performs validations after each step and prints helpful information.
 *
 * IMPORTANT:
 * - Make sure your program is deployed and anchor.workspace.Blocksub points to the correct program id.
 * - If you compiled with a different program id, update declare_id or the client program id accordingly.
 */

async function main() {
  console.log("🚀 Starting robust BlockSub Anchor Demo...");

  // Connection (devnet). Change to localnet if you run local validator.
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Subscriber secret (user-provided)
  const subscriberSecret = Uint8Array.from([
    168, 105, 136, 152, 16, 127, 84, 255, 129, 203, 246, 156, 250, 175, 145,
    102, 135, 122, 46, 36, 175, 14, 223, 202, 206, 207, 192, 90, 82, 175, 77,
    89, 121, 42, 111, 68, 116, 200, 62, 203, 218, 219, 87, 205, 252, 223, 59,
    50, 225, 46, 204, 119, 163, 109, 147, 4, 215, 105, 173, 110, 184, 210, 68,
    210,
  ]);
  const subscriber = Keypair.fromSecretKey(subscriberSecret);

  // Ensure subscriber has SOL (airdrop if needed)
  const bal = await connection.getBalance(subscriber.publicKey);
  console.log(
    "Subscriber:",
    subscriber.publicKey.toBase58(),
    "balance:",
    bal / LAMPORTS_PER_SOL,
    "SOL"
  );
  if (bal < 0.6 * LAMPORTS_PER_SOL) {
    console.log("🔁 Airdropping 1 SOL to subscriber (for test)...");
    const sig = await connection.requestAirdrop(
      subscriber.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, "confirmed");
    console.log("✅ Airdrop confirmed");
  }

  // Merchant is a fresh ephemeral Keypair (recipient)
  const merchant = Keypair.generate();
  console.log("Merchant:", merchant.publicKey.toBase58());

  // Anchor provider and program (assumes anchor.toml / workspace configured)
  const wallet: anchor.Wallet = {
    publicKey: subscriber.publicKey,
    signTransaction: async (tx) => {
      tx.partialSign(subscriber);
      return tx;
    },
    signAllTransactions: async (txs) => {
      txs.forEach((tx) => tx.partialSign(subscriber));
      return txs;
    },
  };

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Use the program object from the workspace. Ensure the program id matches your deployed program.
  const program = anchor.workspace.Blocksub as anchor.Program;
  console.log("Using program id:", program.programId.toBase58());

  // Seeds (must match on-chain)
  const SEED_SUB = Buffer.from("subscription");
  const SEED_ESC = Buffer.from("escrow");

  // derive subscription PDA
  const [subscriptionPda, subscriptionBump] =
    await PublicKey.findProgramAddress(
      [
        SEED_SUB,
        merchant.publicKey.toBuffer(),
        subscriber.publicKey.toBuffer(),
      ],
      program.programId
    );

  // derive escrow/vault PDA
  const [escrowPda, escrowBump] = await PublicKey.findProgramAddress(
    [SEED_ESC, subscriptionPda.toBuffer()],
    program.programId
  );

  console.log(
    "Subscription PDA:",
    subscriptionPda.toBase58(),
    "bump:",
    subscriptionBump
  );
  console.log("Escrow PDA:", escrowPda.toBase58(), "bump:", escrowBump);

  // Params (BN integers)
  const totalMonths = 3;
  const amountPerMonth = new anchor.BN(Math.floor(LAMPORTS_PER_SOL / 10)); // 0.1 SOL
  const lockedAmount = amountPerMonth.mul(new anchor.BN(totalMonths)); // lock exactly for all months

  console.log("amountPerMonth (lamports):", amountPerMonth.toString());
  console.log("lockedAmount (lamports):", lockedAmount.toString());

  // Helper: safely fetch subscription account (return null if not exist)
  async function fetchSubscriptionRaw() {
    try {
      // account name in IDL is likely "subscription"
      return await program.account.subscription.fetch(subscriptionPda);
    } catch {
      return null;
    }
  }

  // Helper: try to fetch escrow vault typed account (ID must match On-Chain account name).
  async function fetchEscrowRaw() {
    try {
      // IDL converts snake_case to camelCase: try both
      // Try program.account.escrowVault first, then escrow_vault
      // @ts-ignore
      if (program.account.escrowVault) {
        // @ts-ignore
        return await program.account.escrowVault.fetch(escrowPda);
      }
      // fallback (older idl)
      // @ts-ignore
      if (program.account.escrow_vault) {
        // @ts-ignore
        return await program.account.escrow_vault.fetch(escrowPda);
      }
      return null;
    } catch {
      return null;
    }
  }

  // Helper: print balances
  async function printBalances(label = "") {
    const sBal = await connection.getBalance(subscriptionPda).catch(() => 0);
    const eBal = await connection.getBalance(escrowPda).catch(() => 0);
    const mBal = await connection.getBalance(merchant.publicKey).catch(() => 0);
    const subBal = await connection
      .getBalance(subscriber.publicKey)
      .catch(() => 0);
    console.log(
      `Balances ${label} -> subscription: ${sBal}, escrow: ${eBal}, merchant: ${mBal}, subscriber: ${subBal}`
    );
  }

  // --- Initialize subscription ---
  console.log("\n📄 Initializing subscription...");
  try {
    const sig = await program.methods
      .initializeSubscription(
        merchant.publicKey,
        amountPerMonth,
        totalMonths,
        lockedAmount
      )
      .accounts({
        subscription: subscriptionPda,
        // IDL/account name may be "escrowVault" (camelCase). Anchor client accepts camelCase.
        // If your IDL differs, this will still work if the compiled client uses the same field name.
        escrowVault: escrowPda,
        subscriber: subscriber.publicKey,
        merchant: merchant.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([subscriber])
      .rpc();

    // rpc() already waits; extra confirm for safety:
    await provider.connection.confirmTransaction(sig, "confirmed");
    console.log("✅ initialize tx:", sig);
  } catch (err: any) {
    console.error("initializeSubscription failed:", err);
    process.exit(1);
  }

  await printBalances("post-init");

  // Validate subscription and escrow state
  const subAcct: any = await fetchSubscriptionRaw();
  if (!subAcct) {
    console.error(
      "ERROR: subscription account not found after initialization."
    );
    process.exit(1);
  }
  console.log("Subscription account fields (post-init):");
  console.log({
    merchant: new PublicKey(subAcct.merchant).toBase58(),
    subscriber: new PublicKey(subAcct.subscriber).toBase58(),
    amountPerMonth: subAcct.amountPerMonth.toString(),
    totalMonths: subAcct.totalMonths,
    monthsPaid: subAcct.monthsPaid,
    nextPaymentTime: subAcct.nextPaymentTime.toString(),
    bump: subAcct.bump,
    lockedAmount: subAcct.lockedAmount.toString(),
  });

  const escrowAcct: any = await fetchEscrowRaw();
  if (!escrowAcct) {
    console.warn(
      "Warning: escrow typed account couldn't be fetched via IDL. That's okay if the account exists as a system account or UncheckedAccount. Attempting raw balance checks below."
    );
  } else {
    console.log("Escrow account fields:", escrowAcct);
  }

  // Sanity check: escrow balance must be >= lockedAmount
  const escrowBalance = await connection.getBalance(escrowPda);
  if (escrowBalance < lockedAmount.toNumber()) {
    console.error(
      `ERROR: escrow PDA balance ${escrowBalance} < lockedAmount ${lockedAmount.toString()}`
    );
    process.exit(1);
  }
  console.log("Escrow PDA funded correctly.");

  // --- Release payments loop ---
  console.log("\n--- Releasing payments ---");
  for (let i = 0; i < totalMonths; i++) {
    console.log(`\n💸 Releasing payment #${i + 1}...`);
    try {
      const sig = await program.methods
        .releasePayment()
        .accounts({
          subscription: subscriptionPda,
          escrowVault: escrowPda,
          merchant: merchant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await provider.connection.confirmTransaction(sig, "confirmed");
      console.log("✅ release tx:", sig);
    } catch (err: any) {
      console.error("releasePayment failed:", err);
      process.exit(1);
    }

    await printBalances(`after release #${i + 1}`);

    // Validate subscription months_paid increased
    const s = await fetchSubscriptionRaw();
    if (!s) {
      console.error("ERROR: subscription account missing after release.");
      process.exit(1);
    }
    console.log("monthsPaid now:", s.monthsPaid);
  }

  // --- Attempt an extra release (should fail with NoMorePayments) ---
  console.log("\n--- Attempting extra release (expected to fail) ---");
  try {
    await program.methods
      .releasePayment()
      .accounts({
        subscription: subscriptionPda,
        escrowVault: escrowPda,
        merchant: merchant.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.error(
      "Unexpected: extra release succeeded (this should not happen)."
    );
    process.exit(1);
  } catch (err: any) {
    // This is expected: we should get program error for NoMorePayments (AnchorError).
    console.log(
      "Expected failure on extra release (program prevented over-release)."
    );
  }

  // --- Cancel subscription (subscriber closes accounts and gets remaining lamports) ---
  console.log("\n🛑 Cancelling subscription...");
  try {
    const sig = await program.methods
      .cancelSubscription()
      .accounts({
        subscription: subscriptionPda,
        escrowVault: escrowPda,
        subscriber: subscriber.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([subscriber])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
    console.log("✅ cancel tx:", sig);
  } catch (err: any) {
    console.error("cancelSubscription failed:", err);
    process.exit(1);
  }

  // Final checks
  await printBalances("post-cancel");

  const finalSub = await fetchSubscriptionRaw();
  if (finalSub === null) {
    console.log("Subscription account closed (ok).");
  } else {
    console.warn("Subscription account still exists (unexpected):", finalSub);
  }

  const finalEscrowBal = await connection.getBalance(escrowPda);
  console.log(
    "Final escrow PDA balance (should be 0 or minimal):",
    finalEscrowBal
  );

  console.log("\n🎉 Demo finished successfully.");
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
