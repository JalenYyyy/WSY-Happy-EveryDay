import { prisma } from "@/lib/prisma";

type ActionThrottleState = {
  count: number;
  windowStartedAt: number;
};

type ConsumeActionThrottleOptions = {
  scope: string;
  subjectId: string;
  limit: number;
  windowMs: number;
};

function getActionThrottleStoreKey(scope: string, subjectId: string) {
  return `actionThrottle:${scope}:${subjectId}`;
}

export async function consumeActionThrottle({ scope, subjectId, limit, windowMs }: ConsumeActionThrottleOptions) {
  const now = Date.now();
  const key = getActionThrottleStoreKey(scope, subjectId);
  const record = await prisma.appSetting.findUnique({ where: { key } });

  let state: ActionThrottleState | null = null;
  if (record) {
    try {
      state = JSON.parse(record.value) as ActionThrottleState;
    } catch {
      await prisma.appSetting.deleteMany({ where: { key } });
    }
  }

  if (!state || now - state.windowStartedAt >= windowMs) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: JSON.stringify({ count: 1, windowStartedAt: now }) },
      create: { key, value: JSON.stringify({ count: 1, windowStartedAt: now }) },
    });

    return { allowed: true as const, retryAfterSeconds: 0 };
  }

  if (state.count >= limit) {
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((state.windowStartedAt + windowMs - now) / 1000)),
    };
  }

  await prisma.appSetting.update({
    where: { key },
    data: { value: JSON.stringify({ count: state.count + 1, windowStartedAt: state.windowStartedAt }) },
  });

  return { allowed: true as const, retryAfterSeconds: 0 };
}