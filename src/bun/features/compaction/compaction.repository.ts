import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client';
import { compactionSnapshots } from '../../infra/db/schema';

export type CompactionSnapshot = {
  // Boundary the model summarizes through: messages newer than this are sent in full.
  coveredThroughAt: string;
  // Chat tail at compaction time: where the UI divider renders (bottom). Falls back
  // to coveredThroughAt for pre-existing rows that predate the column.
  displayThroughAt: string;
  summaryText: string;
};

export function getLatestSnapshot(chatId: string): CompactionSnapshot | undefined {
  const row = db
    .select()
    .from(compactionSnapshots)
    .where(eq(compactionSnapshots.chatId, chatId))
    .orderBy(desc(compactionSnapshots.createdAt))
    .limit(1)
    .get();
  if (!row) {
    return undefined;
  }

  const coveredThroughAt = row.coveredThroughAt.toISOString();
  return {
    coveredThroughAt,
    displayThroughAt: row.displayThroughAt ? row.displayThroughAt.toISOString() : coveredThroughAt,
    summaryText: row.summaryText,
  };
}

export type SaveSnapshotInput = {
  chatId: string;
  coveredThroughAt: Date;
  coveredThroughMessageId: string;
  displayThroughAt: Date;
  summaryText: string;
};

export function saveSnapshot(input: SaveSnapshotInput): void {
  db.insert(compactionSnapshots)
    .values({
      id: randomUUID(),
      chatId: input.chatId,
      createdAt: new Date(),
      coveredThroughAt: input.coveredThroughAt,
      coveredThroughMessageId: input.coveredThroughMessageId,
      displayThroughAt: input.displayThroughAt,
      summaryText: input.summaryText,
      tokensSaved: null,
    })
    .run();
}
