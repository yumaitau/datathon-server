-- Posts no longer wait for Elder approval. Publish anything left in the old queue.
UPDATE "Post" SET "status" = 'published' WHERE "status" = 'pending';
