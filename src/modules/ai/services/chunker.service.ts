import { Chunk, ChunkerOptions } from '../types/ragTypes';

const DEFAULT_SETTINGS: ChunkerOptions = {
  chunkSize: 500,
  overlap: 50,
};

// Chunk the text into chunks of the specified size and overlap
export const chunkText = (
  text: string,
  source: string,
  options: ChunkerOptions = DEFAULT_SETTINGS
): Chunk[] => {
  const { chunkSize, overlap } = options;
  const chunks: Chunk[] = [];
  
  const cleanedText = text.replace(/\r\n/g, '\n').trim();
  
  if (cleanedText.length === 0) {
    return [];
  }
  // If the text is less than or equal to the chunk size, return a single chunk
  if (cleanedText.length <= chunkSize) {
    return [{
      id: `${source}-0`,
      content: cleanedText,
      metadata: {
        source,
        chunkIndex: 0,
      },
    }];
  }
  
  let startIndex = 0;
  let chunkIndex = 0;
  
  // Split the text into chunks
  while (startIndex < cleanedText.length) {
    const endIndex = Math.min(startIndex + chunkSize, cleanedText.length);
    const chunkContent = cleanedText.slice(startIndex, endIndex).trim();
    
    if (chunkContent.length > 0) {
      chunks.push({
        id: `${source}-${chunkIndex}`,
        content: chunkContent,
        metadata: {
          source,
          chunkIndex,
        },
      });
      chunkIndex++;
    }
    
    if (endIndex >= cleanedText.length) {
      break;
    }
    startIndex = endIndex - overlap;
  }
  
  return chunks;
};
