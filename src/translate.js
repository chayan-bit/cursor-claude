// Translation between the OpenAI Chat Completions shape (what Cursor speaks via
// an "OpenAI base URL" override) and the Anthropic Messages shape (upstream).
import { randomUUID } from 'node:crypto';

const DEFAULT_MAX_TOKENS = 4096;

function stopReasonToFinish(reason) {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    default:
      return reason ? 'stop' : null;
  }
}

/** Flatten OpenAI message content (string or multimodal parts) to text/blocks. */
function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p?.type === 'text') return p.text;
        return '';
      })
      .join('');
  }
  return '';
}

/** OpenAI chat request -> Anthropic Messages request. */
export function openaiToAnthropic(body) {
  const systemParts = [];
  const messages = [];
  for (const m of body.messages || []) {
    if (m.role === 'system') {
      systemParts.push(normalizeContent(m.content));
      continue;
    }
    messages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: normalizeContent(m.content),
    });
  }
  const out = {
    model: body.model,
    messages,
    max_tokens: body.max_tokens || body.max_completion_tokens || DEFAULT_MAX_TOKENS,
    stream: !!body.stream,
  };
  if (systemParts.length) out.system = systemParts.join('\n\n');
  if (body.temperature != null) out.temperature = body.temperature;
  if (body.top_p != null) out.top_p = body.top_p;
  if (body.stop != null) {
    out.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  }
  return out;
}

/** Anthropic (non-streaming) response -> OpenAI chat completion. */
export function anthropicToOpenai(resp, model) {
  const text = (resp.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('');
  return {
    id: resp.id || `chatcmpl-${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: resp.model || model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: stopReasonToFinish(resp.stop_reason) || 'stop',
      },
    ],
    usage: {
      prompt_tokens: resp.usage?.input_tokens ?? 0,
      completion_tokens: resp.usage?.output_tokens ?? 0,
      total_tokens:
        (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0),
    },
  };
}

function openaiChunk(id, model, delta, finish_reason = null) {
  return (
    'data: ' +
    JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta, finish_reason }],
    }) +
    '\n\n'
  );
}

/**
 * Consume an Anthropic SSE stream (fetch Response.body) and yield OpenAI
 * Chat Completions SSE chunk strings, terminated by "data: [DONE]".
 */
export async function* translateStream(upstreamBody, model) {
  const id = `chatcmpl-${randomUUID()}`;
  const decoder = new TextDecoder();
  let buffer = '';
  let finish = null;
  let started = false;

  for await (const chunk of upstreamBody) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const raw of events) {
      let dataLine = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      let evt;
      try {
        evt = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (evt.type === 'message_start' && !started) {
        started = true;
        yield openaiChunk(id, model, { role: 'assistant', content: '' });
      } else if (
        evt.type === 'content_block_delta' &&
        evt.delta?.type === 'text_delta'
      ) {
        yield openaiChunk(id, model, { content: evt.delta.text });
      } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
        finish = stopReasonToFinish(evt.delta.stop_reason);
      } else if (evt.type === 'error') {
        yield openaiChunk(id, model, {
          content: `\n[cursor-claude upstream error] ${JSON.stringify(evt.error)}`,
        });
        finish = 'stop';
      }
    }
  }

  yield openaiChunk(id, model, {}, finish || 'stop');
  yield 'data: [DONE]\n\n';
}
