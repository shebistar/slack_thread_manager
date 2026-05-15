CREATE UNIQUE INDEX "uq_silence_alerts_active_thread" ON "silence_alerts" USING btree ("thread_id") WHERE "status" = 'active';
