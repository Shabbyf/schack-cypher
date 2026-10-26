// Allt som sparas lokalt: inställningar, profil (rating, karriär), partier,
// öppningsmisstag och pusselhistorik. Äldre data från version 1 flyttas över.
import { ls, lsSet } from './util.js';

const DEFAULT_SETTINGS = {
  board: 'cypher', pieces: 'cburnett', sfx: true, music: false, voice: true,
  secondChance: true, coords: true, showOpening: true, animate: true,
  puzzleDifficulty: 0, puzzleOnline: true, autoUpdate: true,
};
export const settings = Object.assign({}, DEFAULT_SETTINGS, ls('sc2-settings', {}));
export function saveSettings() { lsSet('sc2-settings', settings); }

export const profile = Object.assign({
  rating: 1000, ratedGames: 0, peak: 1000, ratingHistory: [],
  puzzleRating: 1200, puzzleGames: 0, puzzleHistory: [],
  career: { beaten: {}, title: null }, streakBest: 0, daily: {},
  rec: {},
}, ls('sc2-profile', {}));
export function saveProfile() { lsSet('sc2-profile', profile); }

export let games = ls('sc2-games', null);
export const lessons = ls('sc2-lessons', {});
export function saveLessons() { lsSet('sc2-lessons', lessons); }
export const puzzleSeen = new Set(ls('sc2-puzzle-seen', []));
export function savePuzzleSeen() { lsSet('sc2-puzzle-seen', Array.from(puzzleSeen).slice(-3000)); }

// Flytta över data från första versionen (chess.js-PGN och 'w'/'b').
if (!games) {
  const old = ls('schack-cypher-games', []);
  games = old.map((g) => ({
    id: g.id, date: g.date, variant: 'standard', bot: g.bot, color: g.color === 'b' ? 'black' : 'white',
    result: g.result, pgn: g.pgn, plies: g.plies, rated: false, evals: g.evals || null,
  }));
  const rec = ls('schack-cypher-rec', null);
  if (rec) profile.rec = rec;
  lsSet('sc2-games', games);
  saveProfile();
}
export function saveGames() {
  if (games.length > 60) games.length = 60;
  lsSet('sc2-games', games);
}
export function addGame(g) { games.unshift(g); saveGames(); }
export function findGame(id) { return games.find((g) => g.id === id); }

// Elo mot en bot. K-faktorn är högre de första 20 partierna.
export function eloDelta(rating, opp, score, n) {
  const k = n < 20 ? 40 : 24;
  const exp = 1 / (1 + Math.pow(10, (opp - rating) / 400));
  return Math.round(k * (score - exp));
}
export function applyGameRating(oppElo, score) {
  const d = eloDelta(profile.rating, oppElo, score, profile.ratedGames);
  profile.rating = Math.max(100, profile.rating + d);
  profile.ratedGames++;
  profile.peak = Math.max(profile.peak, profile.rating);
  profile.ratingHistory.push([Date.now(), profile.rating]);
  if (profile.ratingHistory.length > 200) profile.ratingHistory.shift();
  saveProfile();
  return d;
}
export function applyPuzzleRating(puzzleRating, solved) {
  const d = eloDelta(profile.puzzleRating, puzzleRating, solved ? 1 : 0, profile.puzzleGames);
  profile.puzzleRating = Math.max(100, profile.puzzleRating + d);
  profile.puzzleGames++;
  profile.puzzleHistory.push([Date.now(), profile.puzzleRating]);
  if (profile.puzzleHistory.length > 300) profile.puzzleHistory.shift();
  saveProfile();
  return d;
}
export function resetProgress() {
  Object.assign(profile, { rating: 1000, ratedGames: 0, peak: 1000, ratingHistory: [], puzzleRating: 1200, puzzleGames: 0, puzzleHistory: [], career: { beaten: {}, title: null }, streakBest: 0, daily: {}, rec: {} });
  saveProfile();
}
