import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Cliente transaccional (dentro de prisma.$transaction). */
export type Tx = Prisma.TransactionClient;
/** Acepta el cliente raíz o uno transaccional. */
export type Db = PrismaClient | Tx;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Transacción estándar del dominio (ReadCommitted + bloqueos explícitos FOR UPDATE). */
  enTransaccion<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 20_000,
    });
  }
}
