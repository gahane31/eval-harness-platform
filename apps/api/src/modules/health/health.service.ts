import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@eval/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      this.logger.error('Database connectivity check failed.');
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.DATABASE_UNAVAILABLE,
        'Database is unavailable.',
      );
    }

    return { status: 'ok', database: 'up' };
  }
}
