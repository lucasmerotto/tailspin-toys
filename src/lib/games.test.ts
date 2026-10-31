import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
    getGamesByFilters,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

/**
 * Seeds categories, publishers, and games that exercise combined catalog filters.
 *
 * @param db - The in-memory database to seed.
 * @returns The IDs needed to construct filter queries.
 */
async function seedFilterableGames(db: Database): Promise<{
    strategyId: number;
    puzzleId: number;
    pubOneId: number;
    pubTwoId: number;
}> {
    const [strategy] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [puzzle] = await db
        .insert(categories)
        .values({ name: 'Puzzle', description: 'cat' })
        .returning({ id: categories.id });
    const [pubOne] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });
    const [pubTwo] = await db
        .insert(publishers)
        .values({ name: 'Pub Two', description: 'pub' })
        .returning({ id: publishers.id });

    await db.insert(games).values([
        {
            title: 'Alpha Strategy',
            description: 'Strategy game',
            starRating: 4.2,
            categoryId: strategy.id,
            publisherId: pubOne.id,
        },
        {
            title: 'Beta Puzzle',
            description: 'Puzzle game',
            starRating: 4.3,
            categoryId: puzzle.id,
            publisherId: pubOne.id,
        },
        {
            title: 'Gamma Puzzle',
            description: 'Puzzle game',
            starRating: 4.4,
            categoryId: puzzle.id,
            publisherId: pubTwo.id,
        },
    ]);

    return {
        strategyId: strategy.id,
        puzzleId: puzzle.id,
        pubOneId: pubOne.id,
        pubTwoId: pubTwo.id,
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('filters by one or more categories using any selected category', async () => {
        const { strategyId, puzzleId } = await seedFilterableGames(db);

        const strategyGames = await getGamesByFilters(db, { categoryIds: [strategyId] });
        const selectedCategories = await getGamesByFilters(db, { categoryIds: [strategyId, puzzleId] });

        expect(strategyGames.map((game) => game.title)).toEqual(['Alpha Strategy']);
        expect(selectedCategories.map((game) => game.title)).toEqual([
            'Alpha Strategy',
            'Beta Puzzle',
            'Gamma Puzzle',
        ]);
    });

    it('filters by publisher', async () => {
        const { pubTwoId } = await seedFilterableGames(db);

        const filteredGames = await getGamesByFilters(db, { publisherId: pubTwoId });

        expect(filteredGames.map((game) => game.title)).toEqual(['Gamma Puzzle']);
    });

    it('combines selected categories and publisher filters', async () => {
        const { puzzleId, pubOneId } = await seedFilterableGames(db);

        const filteredGames = await getGamesByFilters(db, {
            categoryIds: [puzzleId],
            publisherId: pubOneId,
        });

        expect(filteredGames.map((game) => game.title)).toEqual(['Beta Puzzle']);
    });

    it('returns no games when no records match the filters', async () => {
        const { strategyId, pubTwoId } = await seedFilterableGames(db);

        const filteredGames = await getGamesByFilters(db, {
            categoryIds: [strategyId],
            publisherId: pubTwoId,
        });

        expect(filteredGames).toEqual([]);
    });

    it('returns all games when no filters are selected', async () => {
        await seedFilterableGames(db);

        const unfilteredGames = await getGamesByFilters(db, { categoryIds: [] });

        expect(unfilteredGames.map((game) => game.title)).toEqual([
            'Alpha Strategy',
            'Beta Puzzle',
            'Gamma Puzzle',
        ]);
    });
});
