
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Optional

import asyncpg
import discord
from discord.ext import commands

# Enable intents required for reading message content, reactions, and guild members.
intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.reactions = True

bot = commands.Bot(command_prefix="!", intents=intents)

log = logging.getLogger("image-vote-bot")
logging.basicConfig(level=logging.INFO)

HEART_EMOJI = "❤️"


@dataclass(slots=True)
class GeneratedImage:
    image_id: str
    message_id: int
    creator_id: int
    prompt: str
    image_url: str


class ImageRepository:
    """Persist generated images and heart votes."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def record_generated_image(self, image: GeneratedImage) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO generated_images (image_id, message_id, creator_id, prompt, image_url)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (image_id) DO UPDATE
                SET message_id = EXCLUDED.message_id,
                    creator_id = EXCLUDED.creator_id,
                    prompt = EXCLUDED.prompt,
                    image_url = EXCLUDED.image_url;
                """,
                image.image_id,
                image.message_id,
                image.creator_id,
                image.prompt,
                image.image_url,
            )

    async def get_image_by_message(self, message_id: int) -> Optional[str]:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT image_id FROM generated_images WHERE message_id = $1;
                """,
                message_id,
            )
            return row["image_id"] if row else None

    async def add_vote(self, *, image_id: str, user_id: int, message_id: int) -> bool:
        """Returns True when the vote is new; False when it already existed."""
        async with self._pool.acquire() as conn:
            try:
                await conn.execute(
                    """
                    INSERT INTO image_votes (image_id, user_id, message_id)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (image_id, user_id) DO NOTHING;
                    """,
                    image_id,
                    user_id,
                    message_id,
                )
                # rowcount is not reliable with asyncpg INSERT, so confirm by lookup.
                count = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM image_votes WHERE image_id = $1 AND user_id = $2;
                    """,
                    image_id,
                    user_id,
                )
                return count == 1
            except Exception:
                log.exception("Failed to add vote", extra={"image_id": image_id, "user_id": user_id})
                return False

    async def remove_vote(self, *, image_id: str, user_id: int) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                DELETE FROM image_votes WHERE image_id = $1 AND user_id = $2;
                """,
                image_id,
                user_id,
            )


class ImageVoteBot(commands.Bot):
    def __init__(self, repository: ImageRepository) -> None:
        super().__init__(command_prefix="!", intents=intents)
        self.repository = repository

    async def setup_hook(self) -> None:
        log.info("Bot setup complete")


async def fetch_or_generate_image(prompt: str) -> tuple[str, str]:
    """Stub image generator.

    Replace this with a real model call that returns a unique image_id and URL/path.
    """
    image_id = f"img_{discord.utils.utcnow().timestamp():.0f}"
    image_url = f"https://cdn.example.com/images/{image_id}.png"
    return image_id, image_url


async def build_bot() -> commands.Bot:
    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
    repository = ImageRepository(pool)
    image_bot = ImageVoteBot(repository)

    @image_bot.command(name="imagine")
    async def imagine(ctx: commands.Context, *, prompt: str) -> None:
        image_id, image_url = await fetch_or_generate_image(prompt)
        embed = discord.Embed(title="Fresh Image", description=f"Prompt: {prompt}")
        embed.set_image(url=image_url)
        embed.set_footer(text=f"Image ID: {image_id}")

        message = await ctx.send(embed=embed)
        await message.add_reaction(HEART_EMOJI)

        await repository.record_generated_image(
            GeneratedImage(
                image_id=image_id,
                message_id=message.id,
                creator_id=ctx.author.id,
                prompt=prompt,
                image_url=image_url,
            )
        )

    @image_bot.event
    async def on_raw_reaction_add(payload: discord.RawReactionActionEvent) -> None:
        if payload.user_id == image_bot.user.id:
            return
        if str(payload.emoji) != HEART_EMOJI:
            return

        image_id = await repository.get_image_by_message(payload.message_id)
        if not image_id:
            return

        added = await repository.add_vote(image_id=image_id, user_id=payload.user_id, message_id=payload.message_id)
        if not added:
            # Remove duplicate hearts to show the user they already voted.
            channel = image_bot.get_channel(payload.channel_id) or await image_bot.fetch_channel(payload.channel_id)
            try:
                message = await channel.fetch_message(payload.message_id)
                user = message.guild.get_member(payload.user_id) or await message.guild.fetch_member(payload.user_id)
                await message.remove_reaction(HEART_EMOJI, user)
            except discord.HTTPException:
                log.warning("Could not remove duplicate heart reaction", exc_info=True)

    @image_bot.event
    async def on_raw_reaction_remove(payload: discord.RawReactionActionEvent) -> None:
        if str(payload.emoji) != HEART_EMOJI:
            return
        image_id = await repository.get_image_by_message(payload.message_id)
        if not image_id:
            return
        await repository.remove_vote(image_id=image_id, user_id=payload.user_id)

    return image_bot


async def main() -> None:
    bot_instance = await build_bot()
    await bot_instance.start(os.environ["DISCORD_TOKEN"])


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bot shutting down")

"""
Suggested PostgreSQL schema:

CREATE TABLE generated_images (
    image_id   TEXT PRIMARY KEY,
    message_id BIGINT NOT NULL UNIQUE,
    creator_id BIGINT NOT NULL,
    prompt     TEXT NOT NULL,
    image_url  TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE image_votes (
    image_id   TEXT NOT NULL REFERENCES generated_images (image_id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (image_id, user_id)
);
"""
