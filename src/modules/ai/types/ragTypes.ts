export interface Chunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    chunkIndex: number;
  };
}

export interface ChunkerOptions {
  chunkSize: number;
  overlap: number;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

