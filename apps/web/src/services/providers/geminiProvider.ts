import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TranscriptionResult, InsightData } from '@/types';
import type {
  TranscriptionProvider,
  ProviderCapabilities,
  TranscribeOptions,
  TranscriptionProgress,
  CancellationToken,
} from './types';

/**
 * Gemini Provider — uses Google's Generative AI SDK for both
 * audio transcription and text-based insight extraction.
 *
 * This is the only provider that supports the "insights" capability
 * (summary, sentiment, action items) because it has LLM text generation.
 */
export class GeminiProvider implements TranscriptionProvider {
  readonly type = 'gemini' as const;
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    transcription: true,
    insights: true,
  };

  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-1.5-flash', name?: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Gemini API key is required.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.name = name || 'Google Gemini';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      // Simple test — ask for a single word response
      const result = await model.generateContent('Reply with the single word: OK');
      const text = result.response.text();
      if (text) {
        return { ok: true, message: 'Connected to Google Gemini successfully.' };
      }
      return { ok: false, message: 'Gemini returned an empty response.' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (msg.includes('API_KEY_INVALID') || msg.includes('401')) {
        return { ok: false, message: 'Invalid Gemini API key.' };
      }
      return { ok: false, message: `Connection failed: ${msg}` };
    }
  }

  async transcribeAudio(
    audioFile: File | Blob,
    options: TranscribeOptions,
    onProgress?: (progress: TranscriptionProgress) => void,
    cancellationToken?: CancellationToken,
  ): Promise<TranscriptionResult> {
    if (cancellationToken?.cancelled) {
      throw new Error('Operation cancelled');
    }

    onProgress?.({
      stage: 'uploading',
      progress: 10,
      message: 'Preparing audio for transcription...',
    });

    // Convert blob to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
    );

    const mimeType = audioFile.type || 'audio/wav';

    const model = this.genAI.getGenerativeModel({ model: this.model });

    onProgress?.({
      stage: 'processing',
      progress: 30,
      message: 'Sending audio to Gemini AI...',
    });

    if (cancellationToken?.cancelled) {
      throw new Error('Operation cancelled');
    }

    const prompt = options.prompt
      || 'Transcribe the following audio. Provide the spoken text as accurately as possible.';

    try {
      const result = await model.generateContent([
        {
          inlineData: {
            data: base64,
            mimeType,
          },
        },
        prompt,
      ]);

      onProgress?.({
        stage: 'processing',
        progress: 80,
        message: 'Processing transcription...',
      });

      if (cancellationToken?.cancelled) {
        throw new Error('Operation cancelled');
      }

      const text = result.response.text();

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'Transcription complete!',
      });

      return {
        text: text.trim(),
        confidence: 0.95,
        language: options.language || 'auto-detected',
        timestamp: new Date(),
      };
    } catch (error) {
      if (cancellationToken?.cancelled || (error instanceof Error && error.message === 'Operation cancelled')) {
        throw new Error('Transcription cancelled');
      }
      throw new Error(
        `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async extractInsights(
    transcriptionText: string,
    onProgress?: (progress: TranscriptionProgress) => void,
    cancellationToken?: CancellationToken,
  ): Promise<InsightData> {
    if (cancellationToken?.cancelled) {
      throw new Error('Operation cancelled');
    }

    onProgress?.({
      stage: 'analyzing',
      progress: 10,
      message: 'Preparing text for analysis...',
    });

    const model = this.genAI.getGenerativeModel({ model: this.model });

    const prompt = `Analyze the following transcription and extract key discussion points, overall sentiment (Positive, Negative, or Neutral), potential action items, and a concise summary. Format the output as a JSON object with keys: "summary", "keyPoints" (array of strings), "sentiment" (string), and "actionItems" (array of strings).`;

    onProgress?.({
      stage: 'analyzing',
      progress: 30,
      message: 'Analyzing transcription content...',
    });

    if (cancellationToken?.cancelled) {
      throw new Error('Operation cancelled');
    }

    try {
      const result = await model.generateContent([
        prompt,
        `\n\nTranscription:\n${transcriptionText}`,
      ]);

      onProgress?.({
        stage: 'analyzing',
        progress: 70,
        message: 'Extracting insights...',
      });

      if (cancellationToken?.cancelled) {
        throw new Error('Operation cancelled');
      }

      const text = result.response.text();

      onProgress?.({
        stage: 'analyzing',
        progress: 90,
        message: 'Processing results...',
      });

      // Try to parse as JSON
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          onProgress?.({
            stage: 'complete',
            progress: 100,
            message: 'Insights extracted successfully!',
          });
          return {
            summary: parsed.summary || 'No summary available',
            keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
            sentiment: ['Positive', 'Negative', 'Neutral'].includes(parsed.sentiment)
              ? parsed.sentiment
              : 'Neutral',
            actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            speakers: Array.isArray(parsed.speakers) ? parsed.speakers : [],
          };
        }
      } catch {
        console.warn('Failed to parse JSON response, using fallback parsing');
      }

      // Fallback: simple text parsing
      const fallback = this.parseInsightsFromText(text);
      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'Insights extracted successfully!',
      });
      return fallback;
    } catch (error) {
      if (cancellationToken?.cancelled || (error instanceof Error && error.message === 'Operation cancelled')) {
        throw new Error('Insight extraction cancelled');
      }
      throw new Error(
        `Insight extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private parseInsightsFromText(text: string): InsightData {
    const lines = text.split('\n').filter((line) => line.trim());
    let summary = 'Analysis completed';
    const keyPoints: string[] = [];
    const actionItems: string[] = [];
    let sentiment: 'Positive' | 'Negative' | 'Neutral' = 'Neutral';

    lines.forEach((line) => {
      const lower = line.toLowerCase();
      if (lower.includes('summary') || lower.includes('overview')) {
        summary = line.replace(/^[^:]*:?\s*/, '').trim();
      } else if (lower.includes('key point') || lower.includes('main point')) {
        keyPoints.push(line.replace(/^[^:]*:?\s*/, '').trim());
      } else if (lower.includes('action') || lower.includes('todo') || lower.includes('task')) {
        actionItems.push(line.replace(/^[^:]*:?\s*/, '').trim());
      } else if (lower.includes('positive')) {
        sentiment = 'Positive';
      } else if (lower.includes('negative')) {
        sentiment = 'Negative';
      }
    });

    return {
      summary,
      keyPoints: keyPoints.length > 0 ? keyPoints : ['Key insights extracted from transcription'],
      sentiment,
      actionItems,
      topics: [],
      speakers: [],
    };
  }
}
