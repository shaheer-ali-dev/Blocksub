use anchor_lang::prelude::*;
use solana_program::{program::invoke, system_instruction};

declare_id!("2md8utuDnYAiMNysT2b9NMXPdceS4D6RCXHio1XfeWHU");

const SEEDS_SUBSCRIPTION: &[u8] = b"subscription";
const SEEDS_ESCROW: &[u8] = b"escrow";
const SECONDS_PER_MONTH: i64 = 30 * 24 * 60 * 60; // approximate month in seconds

#[account]
pub struct Subscription {
    pub merchant: Pubkey,
    pub subscriber: Pubkey,
    pub amount_per_month: u64,
    pub total_months: u8,
    pub months_paid: u8,
    pub next_payment_time: i64,
    pub bump: u8,
    pub locked_amount: u64,
}

impl Subscription {
    // Pubkey(32) + Pubkey(32) + u64(8) + u8(1) + u8(1) + i64(8) + u8(1) + u64(8)
    pub const MAX_SIZE: usize = 32 + 32 + 8 + 1 + 1 + 8 + 1 + 8;
}

#[account]
pub struct EscrowVault {
    pub bump: u8,
}

impl EscrowVault {
    pub const MAX_SIZE: usize = 1;
}

#[derive(Accounts)]
#[instruction(merchant: Pubkey, amount_per_month: u64, total_months: u8)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = subscriber,
        space = 8 + Subscription::MAX_SIZE,
        seeds = [SEEDS_SUBSCRIPTION, merchant.key().as_ref(), subscriber.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(
        init,
        payer = subscriber,
        space = 8 + EscrowVault::MAX_SIZE,
        seeds = [SEEDS_ESCROW, subscription.key().as_ref()],
        bump
    )]
    pub escrow_vault: Account<'info, EscrowVault>,

    #[account(mut)]
    pub subscriber: Signer<'info>,

    /// CHECK: merchant only receives lamports
    #[account(mut)]
    pub merchant: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut)]
    pub subscription: Account<'info, Subscription>,

    #[account(mut, seeds = [SEEDS_ESCROW, subscription.key().as_ref()], bump = escrow_vault.bump)]
    pub escrow_vault: Account<'info, EscrowVault>,

    /// CHECK: merchant only receives lamports
    #[account(mut)]
    pub merchant: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(
        mut,
        close = subscriber,
        seeds = [SEEDS_SUBSCRIPTION, subscription.merchant.key().as_ref(), subscription.subscriber.as_ref()],
        bump = subscription.bump,
        has_one = subscriber
    )]
    pub subscription: Account<'info, Subscription>,

    // Let Anchor close the escrow_vault and refund lamports to the subscriber
    #[account(
        mut,
        seeds = [SEEDS_ESCROW, subscription.key().as_ref()],
        bump = escrow_vault.bump,
        close = subscriber
    )]
    pub escrow_vault: Account<'info, EscrowVault>,

    #[account(mut)]
    pub subscriber: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[program]
pub mod blocksub {
    use super::*;

    pub fn initialize_subscription(
        ctx: Context<Initialize>,
        merchant: Pubkey,
        amount_per_month: u64,
        total_months: u8,
        locked_amount: u64,
    ) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        let clock = Clock::get()?;

        require!(amount_per_month > 0, SubscriptionError::InvalidAmount);
        require!(total_months > 0, SubscriptionError::InvalidMonths);

        // ensure locked_amount will cover the full subscription
        let expected_locked = amount_per_month
            .checked_mul(total_months as u64)
            .ok_or(SubscriptionError::Overflow)?;
        require!(
            locked_amount >= expected_locked,
            SubscriptionError::InvalidAmount
        );

        subscription.merchant = merchant;
        subscription.subscriber = *ctx.accounts.subscriber.key;
        subscription.amount_per_month = amount_per_month;
        subscription.total_months = total_months;
        subscription.months_paid = 0;
        subscription.next_payment_time = clock.unix_timestamp + SECONDS_PER_MONTH;

        // store bumps & locked_amount
        subscription.bump = ctx.bumps.subscription;
        subscription.locked_amount = locked_amount;

        // initialize escrow bump
        let escrow = &mut ctx.accounts.escrow_vault;
        escrow.bump = ctx.bumps.escrow_vault;

        msg!(
            "initialize: subscriber={}, escrow={}, locked={}",
            ctx.accounts.subscriber.key(),
            ctx.accounts.escrow_vault.key(),
            locked_amount
        );

        // Transfer lamports from subscriber into the escrow vault PDA (subscriber signs)
        let ix = system_instruction::transfer(
            &ctx.accounts.subscriber.key(),
            &ctx.accounts.escrow_vault.to_account_info().key(),
            locked_amount,
        );
        invoke(
            &ix,
            &[
                ctx.accounts.subscriber.to_account_info(),
                ctx.accounts.escrow_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }

    pub fn release_payment(ctx: Context<Release>) -> Result<()> {
        // copy the subscription Pubkey BEFORE taking a mutable borrow
        let _subscription_key: Pubkey = ctx.accounts.subscription.key();
        let subscription = &mut ctx.accounts.subscription;

        let escrow_info = ctx.accounts.escrow_vault.to_account_info();
        let merchant_info = ctx.accounts.merchant.to_account_info();

        // Ensure there are payments remaining
        require!(
            subscription.months_paid < subscription.total_months,
            SubscriptionError::NoMorePayments
        );

        // Enforce scheduled release time
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= subscription.next_payment_time,
            SubscriptionError::TooEarly
        );

        // Read current balances (immutable read)
        let escrow_balance = escrow_info.lamports();
        let merchant_balance = merchant_info.lamports();

        // Ensure escrow has enough lamports for the monthly amount
        require!(
            escrow_balance >= subscription.amount_per_month,
            SubscriptionError::InsufficientEscrowBalance
        );

        // Ensure locked_amount bookkeeping supports the withdrawal
        require!(
            subscription.locked_amount >= subscription.amount_per_month,
            SubscriptionError::InsufficientEscrowBalance
        );

        // Compute new balances using checked arithmetic before mutably borrowing lamports
        let new_escrow_balance = escrow_balance
            .checked_sub(subscription.amount_per_month)
            .ok_or(SubscriptionError::Overflow)?;
        let new_merchant_balance = merchant_balance
            .checked_add(subscription.amount_per_month)
            .ok_or(SubscriptionError::Overflow)?;

        // Mutably borrow lamports and write the new values
        {
            // try_borrow_mut_lamports returns a RefMut<   ???   >
            // In practice the returned RefMut derefs to a &mut u64, so to assign the u64 value we dereference twice.
            let mut escrow_lamports = escrow_info.try_borrow_mut_lamports()?;
            let mut merchant_lamports = merchant_info.try_borrow_mut_lamports()?;

            // assign computed values — dereference RefMut to get &mut u64, then deref that to u64 target
            **escrow_lamports = new_escrow_balance;
            **merchant_lamports = new_merchant_balance;
        }

        // Update bookkeeping
        subscription.months_paid = subscription
            .months_paid
            .checked_add(1)
            .ok_or(SubscriptionError::Overflow)?;
        subscription.next_payment_time = subscription
            .next_payment_time
            .checked_add(SECONDS_PER_MONTH)
            .ok_or(SubscriptionError::Overflow)?;

        // decrement locked_amount to reflect consumed funds
        subscription.locked_amount = subscription
            .locked_amount
            .checked_sub(subscription.amount_per_month)
            .ok_or(SubscriptionError::Overflow)?;

        msg!(
            "release: sent {} lamports to {}, months_paid={}, next_payment_time={}, remaining_locked={}",
            subscription.amount_per_month,
            ctx.accounts.merchant.key(),
            subscription.months_paid,
            subscription.next_payment_time,
            subscription.locked_amount
        );

        Ok(())
    }

    pub fn cancel_subscription(ctx: Context<Cancel>) -> Result<()> {
        // subscription and escrow will be closed by Anchor (close = subscriber)
        // but add defensive bookkeeping and a log for off-chain systems
        let subscription = &mut ctx.accounts.subscription;
        let escrow_info = ctx.accounts.escrow_vault.to_account_info();
        let subscriber_key = ctx.accounts.subscriber.key();

        // Defensive: ensure only recorded subscriber can cancel (Anchor `has_one = subscriber` enforces this)
        if subscription.subscriber != subscriber_key {
            msg!("cancel: caller mismatch subscription.subscriber != signer");
            return err!(SubscriptionError::Unauthorized);
        }

        // Mark fully paid to prevent accidental further processing (account will be closed anyway)
        subscription.months_paid = subscription.total_months;

        // Log refund amount (escrow lamports at time of cancel)
        let refund_lamports = escrow_info.lamports();
        msg!(
            "cancel: subscription={}, escrow={}, refund_lamports={}, canceled_by={}",
            ctx.accounts.subscription.key(),
            ctx.accounts.escrow_vault.key(),
            refund_lamports,
            subscriber_key
        );

        // Anchor will close the accounts and refund the lamports to the subscriber because of `close = subscriber`.
        Ok(())
    }
}

#[error_code]
pub enum SubscriptionError {
    #[msg("Amount per month must be > 0")]
    InvalidAmount,
    #[msg("Total months must be > 0")]
    InvalidMonths,
    #[msg("Overflow on calculation")]
    Overflow,
    #[msg("Not enough funds in escrow")]
    InsufficientEscrowBalance,
    #[msg("Too early to release payment")]
    TooEarly,
    #[msg("No more payments left")]
    NoMorePayments,
    #[msg("Unauthorized action")]
    Unauthorized,
}
