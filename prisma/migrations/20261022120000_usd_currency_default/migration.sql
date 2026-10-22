-- All prices are in USD from 2026-10-22 (no priced rows existed before this change).
ALTER TABLE "Price" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "Order" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "Transaction" ALTER COLUMN "currency" SET DEFAULT 'USD';
