import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { PollingJob } from './modules/ingestion/polling.job.js';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const mockPollingJob = {
      getLastBatchRun: () => null,
      getLastBatchStatus: () => 'never' as const,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: PollingJob, useValue: mockPollingJob }],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return status ok with batch info', () => {
      expect(controller.getHealth()).toEqual({
        status: 'ok',
        lastBatchRun: null,
        lastBatchStatus: 'never',
      });
    });
  });
});
