# Data: what you need, and the format for your own

The brief asks for two kinds of data, and scores you on saying what your data does not cover.

## 1. Data that shows the problem is real

Pick one country and quote two or three figures, each with source, year and country. None of these are in the prototype yet.

| What to show | Dataset from the brief |
|---|---|
| How much tourism matters there (arrivals, receipts, jobs) | UN Tourism statistics; World Development Indicators, tourism series |
| What phone a woman like Noor actually has | GSMA Mobile Gender Gap Report |
| What holds small firms back (skills, finance, informality) | World Bank Enterprise Surveys |
| Whether there is signal where she lives | OpenCelliD |
| What a visitor searching near the village can find today | OpenStreetMap via Overpass |

## 2. Data you build with

| Need | Dataset | Status in this project |
|---|---|---|
| Postcards, questions, messages, bookings | **Your own** (data/content.json) | In use. All synthetic today |
| Translation between visitor languages and Indonesian | FLORES-200 / NLLB-200 | Planned. Today: translations are stored in the data |
| Speech-to-text for the owner's voice note | Mozilla Common Voice (Indonesian), MMS | Planned. backend/ai.py has an optional speech model hook |
| Sorting guest messages by what they want (price, directions, booking) | MASSIVE | Planned. Today: keyword lists under `themes` |
| Testing the theme counts on real review language | Yelp Open Dataset, Wikivoyage | Planned. Check the license terms fit your use |
| A real map and real distances | OpenStreetMap | Planned. Today: a sketch map with 0 to 100 positions |

Check each license yourself before submitting. The brief only states that Common Voice is CC0.
The brief also says to expect the question "how would it fare in a less-supported language". Decide your answer (for example Sundanese or Javanese) and check how well the models above cover it.

## 3. Your own data: yes, you need to add it

No public dataset contains postcards for a specific small operator. That part has to be yours. Two ways to add it.

### The easy way: the spreadsheet

Open `templates/YoloWisata_Data_Template.xlsx`, edit, save, then run `python scripts/xlsx_to_data.py`.
It rewrites `data/content.json`, refreshes the website copy and runs the checks.

**Sheet: Businesses** (one row per business)

| Column | Required | Format |
|---|---|---|
| id | yes | short, lowercase, no spaces: `noor` |
| name | yes | `Noor’s Coffee Farm` |
| host | yes | how guests address the person: `Noor`, `Pak Darto` |
| sector | yes | one of: Farm, Craft, Food, Guide, Homestay, Other |
| emoji, color | no | one emoji; a colour like `#47C882`. Defaults come from the sector |
| place | no | `Ondera highlands` |
| map_x, map_y | no | 0 to 100 on the sketch map; 0,0 is the top left |
| story | no | two or three sentences |
| duration, price, availability, activities | no | free text, in English. The business side translates common words to Indonesian |
| chips | no | comma separated: `Coffee, Nature, Hands-on` |

**Sheet: Postcards** (one row per visitor memory)

| Column | Required | Format |
|---|---|---|
| business_id | yes | must match an id in Businesses |
| name | yes | nickname only |
| flag | yes | one flag emoji |
| language | yes | `Spanish`, `Indonesian`, `English` and so on |
| text | yes | exactly what the visitor wrote, in their language |
| english | if not English | translation |
| indonesian | if not Indonesian | translation, so the owner can read it |
| background | no | sun, field, sky or coral |
| stickers | no | up to four emoji |
| local | no | 1 for a domestic visitor |

**Sheet: Questions**: business_id, flag, text, english, indonesian, local. Same rules.

**Sheet: Phrases**: indonesian, english, pronunciation (spelled out), emoji.

### The direct way: JSON

Edit `data/content.json`. `templates/business_template.json` shows one business with every field. Then run
`python scripts/validate_data.py` and `python scripts/export_static.py`.

Things only editable in the JSON:

| Key | What it is |
|---|---|
| `themes.loved`, `themes.asks` | The keywords that decide what gets counted, per language. **Add words here for every new sector or language**, or new postcards will not show up in the insights |
| `ideas` | The fixed list of suggestions the tool may make, and which two themes trigger each |
| `sectors` | Emoji, default Travel DNA values, and the sample voice note per sector |
| `swipeCards` | The ten Travel DNA cards |
| `guestQuestions`, `ownerReplies` | Quick messages with their translations |
| each business: `dna`, `why` | Six values from 0 to 1, and the "why it fits you" lines |

### Rules for real visitor data

- Ask permission before using anyone's words. Nicknames only.
- A theme needs 3 mentions to show as "Early signal" and 6 for "Strong pattern", so a handful of postcards will correctly show "Not enough evidence yet".
- Keep synthetic and real rows apart in your data sheet for the judges.

## 4. The data sheet to show the judges

| Dataset | Source | License | Size | What it does not cover |
|---|---|---|---|---|
| YoloWisata demo postcards | Written by the team (synthetic) | Own work | 20 postcards, 3 businesses | Real visitor wording, slang, sarcasm, photos, voice. Seven languages only |
| YoloWisata demo questions | Written by the team (synthetic) | Own work | 16 questions | Same as above |
| Theme keyword lists | Written by the team | Own work | 6 loved themes, 7 request themes | Any theme or language without keywords is silently not counted |
| (each public dataset you actually use) | | check | | |
