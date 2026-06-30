import { prisma } from "@/lib/prisma";

type WhisperReplyItem = {
  id: string;
  cardId: string;
  senderId: string;
  recipientId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: { id: string; name: string; avatarUrl: string | null };
};

export type WhisperCardItem = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  deliverAt: string;
  editedAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  recipient: { id: string; name: string; avatarUrl: string | null };
  replies: WhisperReplyItem[];
  status: "pending" | "active";
};

export type WhisperOverview = {
  partner: { id: string; name: string; avatarUrl: string | null } | null;
  unreadCount: number;
  sections: {
    pending: WhisperCardItem[];
    active: WhisperCardItem[];
  };
};

function serializeReply(reply: {
  id: string;
  cardId: string;
  senderId: string;
  recipientId: string;
  content: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sender: { id: string; name: string; avatarUrl: string | null };
}): WhisperReplyItem {
  return {
    id: reply.id,
    cardId: reply.cardId,
    senderId: reply.senderId,
    recipientId: reply.recipientId,
    content: reply.content,
    readAt: reply.readAt?.toISOString() || null,
    createdAt: reply.createdAt.toISOString(),
    updatedAt: reply.updatedAt.toISOString(),
    sender: reply.sender,
  };
}

function serializeCard(
  card: {
    id: string;
    senderId: string;
    recipientId: string;
    content: string;
    deliverAt: Date;
    editedAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    sender: { id: string; name: string; avatarUrl: string | null };
    recipient: { id: string; name: string; avatarUrl: string | null };
    replies: Array<{
      id: string;
      cardId: string;
      senderId: string;
      recipientId: string;
      content: string;
      readAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      sender: { id: string; name: string; avatarUrl: string | null };
    }>;
  },
  currentUserId: string,
  now: Date,
): WhisperCardItem {
  const isPending = card.senderId === currentUserId && card.deliverAt > now;

  return {
    id: card.id,
    senderId: card.senderId,
    recipientId: card.recipientId,
    content: card.content,
    deliverAt: card.deliverAt.toISOString(),
    editedAt: card.editedAt?.toISOString() || null,
    readAt: card.readAt?.toISOString() || null,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    sender: card.sender,
    recipient: card.recipient,
    replies: card.replies.map(serializeReply),
    status: isPending ? "pending" : "active",
  };
}

export async function getWhisperOverview(currentUserId: string): Promise<WhisperOverview> {
  const now = new Date();
  const [partner, cards, unreadCards, unreadReplies] = await Promise.all([
    prisma.user.findFirst({
      where: { id: { not: currentUserId } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, avatarUrl: true },
    }),
    prisma.whisperCard.findMany({
      where: {
        OR: [{ senderId: currentUserId }, { recipientId: currentUserId }],
      },
      orderBy: [{ deliverAt: "asc" }, { createdAt: "asc" }],
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
        recipient: { select: { id: true, name: true, avatarUrl: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    }),
    prisma.whisperCard.count({
      where: {
        recipientId: currentUserId,
        readAt: null,
        deliverAt: { lte: now },
      },
    }),
    prisma.whisperReply.count({
      where: {
        recipientId: currentUserId,
        readAt: null,
        card: {
          deliverAt: { lte: now },
        },
      },
    }),
  ]);

  const pending = cards
    .filter((card) => card.senderId === currentUserId && card.deliverAt > now)
    .map((card) => serializeCard(card, currentUserId, now));

  const active = cards
    .filter((card) => card.deliverAt <= now)
    .map((card) => serializeCard(card, currentUserId, now));

  return {
    partner,
    unreadCount: unreadCards + unreadReplies,
    sections: {
      pending,
      active,
    },
  };
}
