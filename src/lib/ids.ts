// ID formats shared by the game and the leaderboard server.

/** Anonymous player ID kept in the browser. */
export const PLAYER_ID = /^[a-z0-9-]{16,64}$/
/** A finished game: one per daily date ("daily-20776"), or a practice game's random ID. */
export const GAME_ID = /^(daily-\d{1,6}|practice-[a-z0-9-]{6,40})$/
