import {
  stripCodeFences,
  ensureRenderCall,
  splitSSEFrames,
  getSSEDataPayload,
  extractAnthropicDeltaText,
  extractGoogleDeltaText,
  isGoogleMaxTokensFinish,
  formatSSEEvent,
  extractAnthropicErrorMessage,
  extractGoogleErrorMessage,
} from './generator';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

/** SSE 응답 바디를 읽어 프레임마다 data payload를 onPayload로 전달한다. */
async function forwardSSE(
  body: ReadableStream<Uint8Array>,
  onPayload: (payload: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeFrames = () => {
    const { frames, rest } = splitSSEFrames(buffer);
    buffer = rest;
    for (const frame of frames) {
      const payload = getSSEDataPayload(frame);
      if (payload) onPayload(payload);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      consumeFrames();
    }

    // 스트림이 마지막 빈 줄 없이 끝났을 수 있으므로 남은 버퍼를 최종 프레임으로 처리한다.
    buffer += decoder.decode();
    consumeFrames();
    if (buffer) {
      const payload = getSSEDataPayload(buffer);
      if (payload) onPayload(payload);
    }
  } finally {
    reader.releaseLock();
  }
}

async function streamAnthropic(
  prompt: string,
  apiKey: string,
  onDelta: (text: string) => void,
): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  await forwardSSE(response.body, (payload) => {
    const errorMessage = extractAnthropicErrorMessage(payload);
    if (errorMessage) throw new Error(errorMessage);
    onDelta(extractAnthropicDeltaText(payload));
  });
}

async function streamGoogleModel(
  prompt: string,
  apiKey: string,
  model: string,
  onDelta: (text: string) => void,
): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  await forwardSSE(response.body, (payload) => {
    const errorMessage = extractGoogleErrorMessage(payload);
    if (errorMessage) throw new Error(errorMessage);
    if (isGoogleMaxTokensFinish(payload)) {
      throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
    }
    onDelta(extractGoogleDeltaText(payload));
  });
}

/**
 * GOOGLE_MODELS를 순서대로 시도한다. 단, 한 모델이 델타를 하나라도 클라이언트로
 * 내보낸 뒤 실패하면 다음 모델로 재시도하지 않고 그대로 에러를 던진다 — 재시도하면
 * 이전 모델의 출력 뒤에 새 모델의 출력이 이어붙어 코드가 깨지기 때문이다.
 */
async function streamGoogle(
  prompt: string,
  apiKey: string,
  onDelta: (text: string) => void,
): Promise<void> {
  let hasEmitted = false;
  let lastError: unknown;

  for (const model of GOOGLE_MODELS) {
    try {
      await streamGoogleModel(prompt, apiKey, model, (text) => {
        if (text) hasEmitted = true;
        onDelta(text);
      });
      return;
    } catch (err) {
      lastError = err;
      if (hasEmitted) throw err;
    }
  }

  throw lastError;
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let fullText = '';
            const onDelta = (text: string) => {
              if (!text) return;
              fullText += text;
              controller.enqueue(encoder.encode(formatSSEEvent({ type: 'delta', text })));
            };

            try {
              if (provider === 'google') {
                await streamGoogle(prompt, resolvedKey, onDelta);
              } else {
                await streamAnthropic(prompt, resolvedKey, onDelta);
              }

              const code = ensureRenderCall(stripCodeFences(fullText));
              controller.enqueue(encoder.encode(formatSSEEvent({ type: 'done', code })));
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              const friendlyMessage = message.includes('503')
                ? 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.'
                : message.includes('429')
                  ? '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
                  : message;

              controller.enqueue(
                encoder.encode(formatSSEEvent({ type: 'error', message: friendlyMessage }))
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        return Response.json(
          { error: message },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
