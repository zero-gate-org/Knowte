use rusqlite::{params, Connection};
use serde::Deserialize;
use std::io::Write;

/// A flashcard as deserialized from the pipeline JSON output.
#[derive(Deserialize, Clone)]
pub struct AnkiFlashcard {
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
}

#[derive(Deserialize)]
struct FlashcardsPayload {
    cards: Vec<AnkiFlashcard>,
}

/// Deserialize flashcards from the stored pipeline JSON.
pub fn parse_flashcards(json: &str) -> Result<Vec<AnkiFlashcard>, String> {
    let payload: FlashcardsPayload =
        serde_json::from_str(json).map_err(|e| format!("Failed to parse flashcards: {e}"))?;
    Ok(payload.cards)
}

// ─── Schema ───────────────────────────────────────────────────────────────────

fn create_anki_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode=DELETE;

        CREATE TABLE IF NOT EXISTS col (
            id     INTEGER PRIMARY KEY,
            crt    INTEGER NOT NULL,
            mod    INTEGER NOT NULL,
            scm    INTEGER NOT NULL,
            ver    INTEGER NOT NULL,
            dty    INTEGER NOT NULL,
            usn    INTEGER NOT NULL,
            ls     INTEGER NOT NULL,
            conf   TEXT NOT NULL,
            models TEXT NOT NULL,
            decks  TEXT NOT NULL,
            dconf  TEXT NOT NULL,
            tags   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
            id    INTEGER PRIMARY KEY,
            guid  TEXT NOT NULL,
            mid   INTEGER NOT NULL,
            mod   INTEGER NOT NULL,
            usn   INTEGER NOT NULL,
            tags  TEXT NOT NULL,
            flds  TEXT NOT NULL,
            sfld  TEXT NOT NULL,
            csum  INTEGER NOT NULL,
            flags INTEGER NOT NULL,
            data  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cards (
            id     INTEGER PRIMARY KEY,
            nid    INTEGER NOT NULL,
            did    INTEGER NOT NULL,
            ord    INTEGER NOT NULL,
            mod    INTEGER NOT NULL,
            usn    INTEGER NOT NULL,
            type   INTEGER NOT NULL,
            queue  INTEGER NOT NULL,
            due    INTEGER NOT NULL,
            ivl    INTEGER NOT NULL,
            factor INTEGER NOT NULL,
            reps   INTEGER NOT NULL,
            lapses INTEGER NOT NULL,
            left   INTEGER NOT NULL,
            odue   INTEGER NOT NULL,
            odid   INTEGER NOT NULL,
            flags  INTEGER NOT NULL,
            data   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS revlog (
            id      INTEGER PRIMARY KEY,
            cid     INTEGER NOT NULL,
            usn     INTEGER NOT NULL,
            ease    INTEGER NOT NULL,
            ivl     INTEGER NOT NULL,
            lastIvl INTEGER NOT NULL,
            factor  INTEGER NOT NULL,
            time    INTEGER NOT NULL,
            type    INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS graves (
            usn  INTEGER NOT NULL,
            oid  INTEGER NOT NULL,
            type INTEGER NOT NULL
        );
        "#,
    )
}

// ─── Simple field checksum (approximates Anki's SHA1[:8] approach) ────────────

fn field_checksum(text: &str) -> i64 {
    let mut h: u64 = 0xcbf29ce484222325; // FNV offset basis
    for b in text.bytes().take(256) {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3); // FNV prime
    }
    // Keep positive 32-bit range to match Anki's uint format
    (h & 0x7FFF_FFFF) as i64
}

// ─── .apkg Export ────────────────────────────────────────────────────────────

pub fn export_as_apkg(
    cards: &[AnkiFlashcard],
    deck_name: &str,
    output_path: &str,
) -> Result<(), String> {
    let now_secs = chrono::Utc::now().timestamp();
    // Spread IDs so they don't collide with previously exported decks
    let model_id: i64 = now_secs * 1000;
    let deck_id: i64 = now_secs * 1000 + 1;

    // ── Build JSON metadata blobs ─────────────────────────────────────────────

    let css = ".card { font-family: arial; font-size: 20px; text-align: center; \
               color: black; background-color: white; }";

    let models_json = format!(
        concat!(
            r#"{{"{mid}": {{"id": {mid}, "name": "Basic", "type": 0, "mod": {now},"#,
            r#""usn": -1, "sortf": 0, "did": {did},"#,
            r#""tmpls": [{{"name": "Card 1", "ord": 0,"#,
            r#""qfmt": "{{{{Front}}}}", "afmt": "{{{{FrontSide}}}}\n\n<hr id=answer>\n\n{{{{Back}}}}"#,
            r#", "bqfmt": "", "bafmt": "", "did": null, "bfont": "", "bsize": 0}}],"#,
            r#""flds": [{{"name": "Front", "ord": 0, "sticky": false, "rtl": false,"#,
            r#""font": "Arial", "size": 20, "media": []}},"#,
            r#"{{"name": "Back", "ord": 1, "sticky": false, "rtl": false,"#,
            r#""font": "Arial", "size": 20, "media": []}}],"#,
            r#""css": {css}, "latexPre": "", "latexPost": "", "req": [[0, "all", [0]]]}}}}"#
        ),
        mid = model_id,
        now = now_secs,
        did = deck_id,
        css = serde_json::to_string(css).unwrap_or_default(),
    );

    let safe_deck_name = serde_json::to_string(deck_name).unwrap_or_default();

    let decks_json = format!(
        concat!(
            r#"{{"1": {{"id": 1, "mod": {now}, "name": "Default", "usn": -1,"#,
            r#""lrnToday": [0, 0], "revToday": [0, 0], "newToday": [0, 0], "timeToday": [0, 0],"#,
            r#""collapsed": true, "browserCollapsed": true, "desc": "", "dyn": 0, "conf": 1, "extendNew": 0, "extendRev": 0}},"#,
            r#""{did}": {{"id": {did}, "mod": {now}, "name": {name}, "usn": -1,"#,
            r#""lrnToday": [0, 0], "revToday": [0, 0], "newToday": [0, 0], "timeToday": [0, 0],"#,
            r#""collapsed": false, "browserCollapsed": false, "desc": "", "dyn": 0, "conf": 1, "extendNew": 0, "extendRev": 0}}}}"#
        ),
        now = now_secs,
        did = deck_id,
        name = safe_deck_name,
    );

    let dconf_json = format!(
        concat!(
            r#"{{"1": {{"id": 1, "mod": {now}, "name": "Default", "usn": -1, "maxTaken": 60,"#,
            r#""autoplay": true, "timer": 0, "replayq": true,"#,
            r#""new": {{"delays": [1, 10], "ints": [1, 4, 7], "initialFactor": 2500,"#,
            r#""separate": true, "order": 1, "perDay": 20, "bury": false}},"#,
            r#""lapse": {{"delays": [10], "mult": 0, "minInt": 1, "leechFails": 8, "leechAction": 0}},"#,
            r#""rev": {{"ease4": 1.3, "ivlFct": 1, "maxIvl": 36500, "perDay": 200, "hardFactor": 1.2, "bury": false}},"#,
            r#""dyn": false}}}}"#
        ),
        now = now_secs,
    );

    let conf_json = format!(
        concat!(
            r#"{{"nextPos": 1, "estTimes": true, "activeDecks": [1], "sortType": "noteFld","#,
            r#""timeLim": 0, "sortBackwards": false, "addToCur": true, "curDeck": 1,"#,
            r#""newBury": true, "newSpread": 0, "dueCounts": true,"#,
            r#""curModel": "{mid}", "collapseTime": 1200}}"#
        ),
        mid = model_id,
    );

    // ── Create temporary SQLite database ──────────────────────────────────────

    let tmp_db = std::env::temp_dir().join(format!(
        "cognote_{}.anki2",
        uuid::Uuid::new_v4()
    ));

    {
        let conn = Connection::open(&tmp_db)
            .map_err(|e| format!("Failed to create temp SQLite: {e}"))?;

        create_anki_schema(&conn).map_err(|e| format!("Schema error: {e}"))?;

        // Insert the single `col` row
        conn.execute(
            "INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) \
             VALUES (1, ?1, ?2, ?3, 11, 0, 0, 0, ?4, ?5, ?6, ?7, '{}')",
            params![now_secs, now_secs, now_secs * 1000, conf_json, models_json, decks_json, dconf_json],
        )
        .map_err(|e| format!("Failed to insert col: {e}"))?;

        // Insert each flashcard as a note + card pair
        for (i, card) in cards.iter().enumerate() {
            let note_id: i64 = now_secs * 1000 + i as i64;
            let card_id: i64 = now_secs * 1000 + 10_000 + i as i64;

            // Fields joined by the Anki field separator (\x1f)
            let flds = format!("{}\x1f{}", card.front, card.back);
            let sfld = card.front.clone();
            let csum = field_checksum(&sfld);

            // Tags: space-padded if non-empty (Anki convention: " tag1 tag2 ")
            let tags_str = if card.tags.is_empty() {
                String::new()
            } else {
                format!(" {} ", card.tags.join(" "))
            };

            // guid can be any unique string ≤ 10 chars; use base-36-like from note_id
            let guid = format!("{:x}", note_id & 0x0000_FFFF_FFFF);

            conn.execute(
                "INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) \
                 VALUES (?1, ?2, ?3, ?4, -1, ?5, ?6, ?7, ?8, 0, '')",
                params![note_id, guid, model_id, now_secs, tags_str, flds, sfld, csum],
            )
            .map_err(|e| format!("Failed to insert note {i}: {e}"))?;

            conn.execute(
                "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, \
                 ivl, factor, reps, lapses, left, odue, odid, flags, data) \
                 VALUES (?1, ?2, ?3, 0, ?4, -1, 0, 0, ?5, 0, 0, 0, 0, 0, 0, 0, 0, '')",
                params![card_id, note_id, deck_id, now_secs, i as i64],
            )
            .map_err(|e| format!("Failed to insert card {i}: {e}"))?;
        }
    } // Connection closed here

    // ── Read temp DB bytes ────────────────────────────────────────────────────

    let db_bytes =
        std::fs::read(&tmp_db).map_err(|e| format!("Failed to read temp DB: {e}"))?;
    let _ = std::fs::remove_file(&tmp_db);

    // ── Package as ZIP (.apkg) ────────────────────────────────────────────────

    let out_file = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {e}"))?;
    let mut zip = zip::ZipWriter::new(out_file);

    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);

    zip.start_file("media", opts)
        .map_err(|e| format!("ZIP start_file error: {e}"))?;
    zip.write_all(b"{}")
        .map_err(|e| format!("ZIP write error: {e}"))?;

    zip.start_file("collection.anki2", opts)
        .map_err(|e| format!("ZIP start_file error: {e}"))?;
    zip.write_all(&db_bytes)
        .map_err(|e| format!("ZIP write error: {e}"))?;

    zip.finish()
        .map_err(|e| format!("ZIP finish error: {e}"))?;

    Ok(())
}

// ─── TSV Export ───────────────────────────────────────────────────────────────

/// Export flashcards as a tab-separated .txt file for Anki's "Import" feature.
///
/// Format:
/// ```
/// #separator:tab
/// #html:false
/// #notetype:Basic
/// #deck:LectureToLearn::<title>
/// front<TAB>back<TAB>tags
/// ```
pub fn export_as_tsv(
    cards: &[AnkiFlashcard],
    deck_name: &str,
    output_path: &str,
) -> Result<(), String> {
    let mut content = String::new();
    content.push_str("#separator:tab\n");
    content.push_str("#html:false\n");
    content.push_str("#notetype:Basic\n");
    content.push_str(&format!("#deck:{deck_name}\n"));
    content.push_str("#columns:Front\tBack\tTags\n");

    for card in cards {
        let front = card
            .front
            .replace('\t', " ")
            .replace('\r', "")
            .replace('\n', "<br>");
        let back = card
            .back
            .replace('\t', " ")
            .replace('\r', "")
            .replace('\n', "<br>");
        let tags = card.tags.join(" ");
        content.push_str(&format!("{front}\t{back}\t{tags}\n"));
    }

    std::fs::write(output_path, content.as_bytes())
        .map_err(|e| format!("Failed to write TSV: {e}"))
}
