# Priority consular districts

Researched 2026-11-07 using public government sources only. These are service jurisdictions, not legal advice or a guarantee of assistance. Confirm with the consulate.

## Priority metric

[ICE FY2024 annual report](https://www.ice.gov/doclib/eoy/iceAnnualReportFY2024.pdf): removals by **country of citizenship**, October 1, 2023–September 30, 2024. Mexico 87,298; Guatemala 66,435; Honduras 45,923; El Salvador 15,284; Colombia 14,268; Ecuador 12,921. Citizenship is not necessarily removal destination. This is a dated prioritization proxy, not a claim about current rankings. A newer comparable complete official table was not verified.

## Colombia

[Official embassy jurisdiction directory](https://estadosunidos.embajada.gov.co/embajada/concurrencia), with [Miami confirmation](https://miami.consulado.gov.co/ayuda/circunscripcion). Transcribed whole-state assignments and the explicit Miami/Orlando county lists. Normalized obvious Florida spellings Paseo→Pasco and Okechobee→Okeechobee. California is intentionally omitted: north/south descriptions are not county boundaries. Los Angeles and San Francisco polygons therefore show only their verified other-state jurisdictions. Source dates in this addition mean **checked**, not publication or effective dates. Official indexed text was available although direct page access can be blocked.

## Higher-priority research still unresolved

- Guatemala: [MINEX directory](https://www.minex.gob.gt/index.php/din/3128-atencion-consular) contains county spelling/duplication issues and an apparent Houston/McAllen Calhoun (Kalhoun) conflict. No guessed allocation is shipped.
- Honduras and El Salvador: office directories alone do not establish jurisdiction. A complete authoritative partition was not verified in this pass.

## Reproduction and integrity

Run `python pipeline/scrapers/consular.py --check` then `python pipeline/scrapers/consular.py --built YYYY-MM-DD` with geopandas installed. Inputs are versioned in `pipeline/reference/consular/`. The same Census 2021 county geography as Mexico is used. Undeclared gaps, duplicates and overlaps fail; declared unverified counties are counted in metadata and never rendered. American Samoa, Guam and Northern Mariana Islands remain outside the existing partition. No detention microdata is downloaded or changed by this work.

## Ecuador shipped coverage

The official directory explicitly supplies ten whole-state jurisdictions and the Queens agency’s five New York counties (Richmond, Kings, Queens, Nassau, Suffolk). The general New York consulate entry does not specify jurisdiction: the remaining counties stay unverified, not automatically assigned to it. Puerto Rico and the U.S. Virgin Islands also remain unverified. [Washington](https://www.cancilleria.gob.ec/washington/2022/01/21/contacto/), [Los Angeles](https://www.cancilleria.gob.ec/losangeles/informacion-de-la-mision/), [Houston](https://www.cancilleria.gob.ec/houston/2021/10/01/gestion-del-consulado/) and [Phoenix](https://www.cancilleria.gob.ec/phoenix/2025/03/08/datos-generales-del-consulado/) corroborate individual assignments. Source access limitations are the same as Colombia: indexed official jurisdiction text was available, while direct access sometimes failed. A news report of PR/VI coverage was not substituted for an explicit official assignment.

Colombia’s Pasco spelling is also corroborated by [Decree 2348 of 2015](https://cancilleria.gov.co/normograma/compilacion/docs/decreto_2348_2015.htm).

## Source ledger: how to audit each district

This ledger records the sources used to create the polygons in this PR. It is not a fresh certification that each live page still says the same thing. For Colombia and Ecuador, **2026-11-07 is the date the official indexed source text was checked**, not a publication date, effective date, or evidence that jurisdiction was changed on that day. No publication/effective date was established for the consolidated directories. Dated individual article URLs are identified below without treating their URL date as a new jurisdiction's effective date.

Direct retrieval of some official pages returned 403/502 errors. The research used search-indexed text of the official pages, plus the listed official corroborating pages. The repository does not contain a downloaded page snapshot, archived capture timestamp, or content hash for those checks. Consequently, this is reproducible polygon construction from a versioned transcription, **not** a byte-for-byte reproduction of the original government webpages. Live and indexed pages may diverge or change; recheck the primary sources before updating jurisdiction assignments.

Each district below names its primary source, checked date, and exact mapped coverage. Two consulates may correctly cite the same consolidated government directory. A `source_url` is evidence for jurisdiction, not a consulate location or a nearest-office calculation. State abbreviations are USPS codes. A listed whole state includes all its Census 2021 county equivalents. County lists are enumerated where a state is split.

### Colombia: district-by-district source ledger

Versioned transcription: [`colombia.json`](../pipeline/reference/consular/colombia.json). Output: [`colombia.geojson`](../web/public/data/consular/colombia.geojson).

#### Consulate of Colombia in Atlanta (`atlanta`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: GA, AL, NC, SC, KY, MS, TN.

#### Consulate of Colombia in Boston (`boston`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: MA, ME, NH, RI, VT.

#### Consulate of Colombia in Chicago (`chicago`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: IL, ND, SD, IN, IA, KS, MI, MN, MO, NE, OH, WI.

#### Consulate of Colombia in Houston (`houston`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: TX, AR, LA, OK.

#### Consulate of Colombia in Los Angeles (`los-angeles`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: AZ, NM.
- **Incomplete district:** California coverage is not drawn. The official north/south description was not translated into an invented county boundary.

#### Consulate of Colombia in Newark (`newark`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: NJ, PA.

#### Consulate of Colombia in New York (`new-york`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: NY, CT.

#### Consulate of Colombia in San Francisco (`san-francisco`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: AK, CO, HI, ID, MT, NV, OR, UT, WA, WY.
- **Incomplete district:** California coverage is not drawn. The official north/south description was not translated into an invented county boundary.

#### Consulate of Colombia in Washington (`washington`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: DC, DE, MD, VA, WV.

#### Consulate of Colombia in San Juan (`san-juan`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped whole states/territories: PR, VI.

#### Consulate of Colombia in Miami (`miami`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped counties in FL: Broward, Charlotte, Collier, DeSoto, Glades, Hardee, Hendry, Highlands, Lee, Manatee, Martin, Miami-Dade, Monroe, Okeechobee, Palm Beach, St. Lucie, Sarasota.
- Corroboration: [Official Miami jurisdiction page](https://miami.consulado.gov.co/ayuda/circunscripcion).

#### Consulate of Colombia in Orlando (`orlando`)

- Primary jurisdiction source: [official government page](https://estadosunidos.embajada.gov.co/embajada/concurrencia). Checked: **2026-11-07**.
- Mapped counties in FL: Alachua, Bay, Bradford, Baker, Brevard, Calhoun, Citrus, Clay, Columbia, Dixie, Duval, Escambia, Flagler, Franklin, Gadsden, Gilchrist, Gulf, Hamilton, Hernando, Hillsborough, Holmes, Indian River, Jackson, Jefferson, Lafayette, Lake, Leon, Levy, Liberty, Madison, Marion, Nassau, Okaloosa, Orange, Osceola, Pasco, Pinellas, Polk, Putnam, Santa Rosa, Seminole, St. Johns, Sumter, Suwannee, Taylor, Union, Volusia, Wakulla, Walton, Washington.
- Corroboration: [Official Decree 2348 of 2015](https://cancilleria.gov.co/normograma/compilacion/docs/decreto_2348_2015.htm) corroborates the Pasco county spelling; the current directory is the assignment source.


### Ecuador: district-by-district source ledger

Versioned transcription: [`ecuador.json`](../pipeline/reference/consular/ecuador.json). Output: [`ecuador.geojson`](../web/public/data/consular/ecuador.geojson).

#### Consulate of Ecuador in Atlanta (`atlanta`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: AL, NC, SC, GA, TN, MS.

#### Consulate of Ecuador in Chicago (`chicago`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: IL, IN, KY, MI, MO, OH, WI.

#### Consulate of Ecuador in Houston (`houston`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: TX, OK, KS, AR, LA.
- Corroboration: [Official consular management page](https://www.cancilleria.gob.ec/houston/2021/10/01/gestion-del-consulado/), dated 2021-10-01 in its URL, not asserted as an effective date.

#### Consulate of Ecuador in Los Angeles (`los-angeles`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: CA, NV, OR, WA, AK, HI.
- Corroboration: [Official mission information](https://www.cancilleria.gob.ec/losangeles/informacion-de-la-mision/).

#### Consulate of Ecuador in Miami (`miami`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: FL.

#### Consulate of Ecuador in New Jersey (`new-jersey`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: NJ, PA.

#### Consulate of Ecuador in Minneapolis (`minneapolis`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: MN, IA, ND, SD, NE.

#### Consulate of Ecuador in Connecticut-New Haven (`new-haven`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: CT, ME, RI, VT, NH, MA.

#### Consulate of Ecuador in Phoenix (`phoenix`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped whole states/territories: AZ, NM, CO, UT, ID, MT, WY.
- Corroboration: [Official general information page](https://www.cancilleria.gob.ec/phoenix/2025/03/08/datos-generales-del-consulado/), dated 2025-03-08 in its URL, not asserted as an effective date.

#### Consulate of Ecuador in Washington (`washington`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/washington/2022/01/21/contacto/). Checked: **2026-11-07**.
- Mapped whole states/territories: DE, DC, MD, VA, WV.
- Corroboration: [Consolidated official directory](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). The primary contact-page URL is dated 2022-01-21; this is not asserted to be an effective date.

#### Consular Agency of Ecuador in Queens (`queens`)

- Primary jurisdiction source: [official government page](https://www.cancilleria.gob.ec/map_maps/estados-unidos/). Checked: **2026-11-07**.
- Mapped counties in NY: Richmond, Kings, Queens, Nassau, Suffolk.
- This is the Queens consular agency. The five explicitly assigned counties do not establish the general New York consulate’s jurisdiction over the rest of the state.

### Explicit unverified areas and out-of-scope territory

- **Colombia:** all 58 California counties. These are a documented gap, not a claim that California lacks consular coverage. Los Angeles and San Francisco have partial polygons covering only their verified other states.
- **Ecuador:** 57 New York counties outside Richmond, Kings, Queens, Nassau and Suffolk; all 78 Puerto Rico municipios; all 3 U.S. Virgin Islands county equivalents. Total: **138 unverified county equivalents**. The exact New York names are versioned in `ecuador.json` under `unverified`.
- **All countries:** American Samoa, Guam and Northern Mariana Islands are outside the existing map partition. Ecuador's Los Angeles source may include additional territories, but this PR does not expand the product's geography. Foreign countries/territories, such as the Marshall Islands or non-U.S. Caribbean jurisdictions, are not added to a U.S. county overlay.
- Blank areas are never assigned to the nearest office or to a leftover consulate. The UI explicitly warns that blank does not mean no consular service.

## Geometry source and construction method

The legal/service jurisdiction lists and the geographic shapes come from **different sources**:

1. **Jurisdiction facts:** the official sources in the ledger above, transcribed to `pipeline/reference/consular/<country>.json`. A whole-state entry is `"all"`; a split state lists county names. Unverified areas are a separate named list, not a district.
2. **County geography:** U.S. Census Bureau [2021 cartographic county boundary file, 1:5,000,000](https://www2.census.gov/geo/tiger/GENZ2021/shp/cb_2021_us_county_5m.zip), file `cb_2021_us_county_5m.zip`. The generator caches this public ZIP in `pipeline/cache/`. The 2021 vintage retains Connecticut's eight counties, matching the established county-list model, instead of the newer nine planning regions. These are generalized cartographic shapes, not surveyed or legal jurisdiction boundary data.
3. **Name matching:** join within the state using normalized county names and retain Census `GEOID` values. Normalization removes accents, punctuation and county-equivalent suffixes, normalizes Saint/St., and ignores spacing/case. Existing explicit county aliases are in [`county_aliases.json`](../pipeline/reference/consular/county_aliases.json). Ambiguous or unmatched names fail instead of silently dropping geography.
4. **Transcription corrections for this PR:** Colombia's official directory spellings `Paseo` and `Okechobee` were normalized to Florida's **Pasco** and **Okeechobee**. Pasco is corroborated by the official 2015 decree. The correction is of spelling, not an inferred transfer of jurisdiction. No additional country-specific aliases or guessed California split were introduced.
5. **Coverage validation:** resolve verified districts and the explicitly unverified areas against the same Census universe. Each included county must appear exactly once in this combined partition; overlaps or undeclared gaps fail the build. A public `coverage_note` is required for an unverified list. The unverified area is counted in metadata but is never emitted as a polygon.
6. **Geometry construction:** reproject county geometries to WGS84 (`EPSG:4326`), union the counties belonging to each district, then snap coordinate precision to **0.0001 degrees**. No office-point Voronoi allocation, proximity buffer, geocoded radius or inferred north/south dividing line is used. County-level geometry cannot express a sub-county jurisdiction.
7. **Presentation:** assign up to six colors using adjacency so touching districts do not share a fill. Colors have no risk or service-quality meaning. Emit a GeoJSON feature per verified district, including the primary source URL, checked date, included states and county count. Emit country metadata and limitations in `index.json` and display them in the picker.

Implementation: [`pipeline/scrapers/consular.py`](../pipeline/scrapers/consular.py). Tests: [`pipeline/tests/test_consular.py`](../pipeline/tests/test_consular.py) and [`web/scripts/consular-smoke.cjs`](../web/scripts/consular-smoke.cjs).

### Rebuild commands and expected coverage

From the repository root, in a Python environment with the pipeline dependencies plus GeoPandas and pytest:

```sh
python pipeline/scrapers/consular.py --check
python pipeline/scrapers/consular.py --built 2026-11-07
python -m pytest pipeline/tests/ -q
```

The first command validates the transcriptions against the cached/downloaded Census geography without rewriting the GeoJSON. The second reproduces this PR's build-date stamp; use the actual new build date when deliberately refreshing data. It rebuilds all registered countries, not just the new additions. Expected district counts are Mexico 53, Colombia 12, Ecuador 11. Expected unverified counts are respectively 0, 58 and 138. No detention microdata is fetched by this generator.

The 2021 base geography and date-checked jurisdiction transcriptions describe different times. A successful build establishes internal geographic consistency, not that governments have made no subsequent changes. The source-ledger audit should precede future data refreshes.

## Existing Mexico provenance (not new jurisdiction research in this PR)

Mexico's 53 district assignments were inherited from merged PR #5. This PR regenerates metadata, not those assignments. Its versioned source ledger is [`mexico.json`](../pipeline/reference/consular/mexico.json): every district has its own `source_url`, `source_date` and exact county list. The recorded dates span **2018-09-12 to 2026-08-22** and mix the older directory date with previously recorded webpage dates; this PR does not reclassify or newly certify those legacy dates as publication/effective dates.

The prior methodology uses consulates' official SRE circunscripción pages (some researched through Wayback), otherwise per-consulate PDFs in the [SRE consular network directory](https://www.gob.mx/sre/documentos/red-consular-de-mexico-en-los-estados-unidos-de-america), plus the [June 2022 redistricting announcement](https://www.gob.mx/sre/prensa/comunicado-no-198) and later Oklahoma City/New Brunswick openings. The original transcription does not supply per-page archive capture IDs, so those cannot be reconstructed from its dates alone. Existing sub-county approximations retain the whole county with the consulate of its seat, including Pima County/Nogales and Yuma/Lukeville. They are not new precise boundaries established by this PR.

For convenient review, the inherited primary link for every Mexico district follows. Exact coverage stays in the linked versioned JSON rather than duplicating 53 lengthy county lists here.

| District | Recorded legacy source date | Primary source |
| --- | --- | --- |
| Consulado de México en Albuquerque (`albuquerque`) | 2026-08-22 | [SRE source](https://consulmex.sre.gob.mx/albuquerque/index.php/circunscripcion) |
| Consulado General de México en Atlanta (`atlanta`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389646/2.Consulado_General_de_M_xico_en_Atlanta.pdf) |
| Consulado General de México en Austin (`austin`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389645/3.Consulado_General_de_M_xico_en_Austin.pdf) |
| Consulado de México en Boise (`boise`) | 2022-06-01 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389644/4.Consulado_de_M_xico_en_Boise.pdf + https://www.gob.mx/sre/prensa/comunicado-no-198) |
| Consulado General de México en Boston (`boston`) | 2023-05-19 | [SRE source](https://web.archive.org/web/20230519131809/https://consulmex.sre.gob.mx/boston/index.php/acerca-del-consulado/circunscripcion) |
| Consulado de Carrera de México en Brownsville (`brownsville`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389642/6.Consulado_de_Carrera_de_M_xico_en_Brownsville_.pdf) |
| Consulado de Carrera de México en Caléxico (`calexico`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389641/7.Consulado_de_Carrera_de_M_xico_en_Cal_xico.pdf) |
| Consulado General de México en Chicago (`chicago`) | 2022-06-01 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389640/8.Consulado_General_de_M_xico_en_Chicago.pdf + https://www.gob.mx/sre/prensa/comunicado-no-198) |
| Consulado General de México en Dallas (`dallas`) | 2022-06-01 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389639/9.Consulado_General_de_M_xico_en_Dallas_.pdf + https://www.gob.mx/sre/prensa/comunicado-no-198) |
| Consulado de Carrera de México en Del Rio (`del-rio`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389638/10.Consulado_de_Carrera_de_M_xico_en_Del_R_o_.pdf) |
| Consulado General de México en Denver (`denver`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389637/11.Consulado_General_de_M_xico_en_Denver.pdf) |
| Consulado de Carrera de México en Detroit (`detroit`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389636/12.Consulado_de_Carrera_de_M_xico_en_Detroit.pdf) |
| Consulado de Carrera de México en Douglas (`douglas`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389634/13.Consulado_de_Carrera_de_M_xico_en_Douglas.pdf) |
| Consulado de Carrera de México en Eagle Pass (`eagle-pass`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389633/14.Consulado_de_Carrera_de_M_xico_en_Eagle_Pass.pdf) |
| Consulado General de México en El Paso (`el-paso`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389632/15.Consulado_General_de_M_xico_en_El_Paso.pdf) |
| Consulado de Carrera de México en Filadelfia (`filadelfia`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389631/16.Consulado_de_Carrera_de_M_xico_en_Filadelfia.pdf) |
| Consulado de México en Fresno (`fresno`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389630/17.Consulado_de_M_xico_en_Fresno.pdf) |
| Consulado de México en Houston (`houston`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389629/18.Consulado_de_M_xico_en_Houston.pdf) |
| Consulado de Carrera de México en Indianápolis (`indianapolis`) | 2022-06-01 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389628/19.Consulado_de_Carrera_de_M_xico_en_Indian_polis.pdf + https://www.gob.mx/sre/prensa/comunicado-no-198) |
| Consulado de Carrera de México en Kansas City (`kansas-city`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389627/20.Consulado_de_Carrera_de_M_xico_en_Kansas_City.pdf) |
| Consulado General de México en Laredo (`laredo`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389626/21.Consulado_General_de_M_xico_en_Laredo.pdf) |
| Consulado de México en Las Vegas (`las-vegas`) | 2022-06-01 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389625/22.Consulado_de_M_xico_en_Las_Vegas.pdf + https://www.gob.mx/sre/prensa/comunicado-no-198) |
| Consulado de Carrera de México en Little Rock (`little-rock`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389623/23.Consulado_de_Carrera_de_M_xico_en_Little_Rock.pdf) |
| Consulado General de México en Los Ángeles (`los-angeles`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389622/24.Consulado_General_de_M_xico_en_Los__ngeles.pdf) |
| Consulado de México en McAllen (`mcallen`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389621/25.Consulado_de_M_xico_en_Mc_Allen.pdf) |
| Consulado General de México en Miami, Florida (`miami`) | 2022-06-01 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389620/26.Consulado_General_De_M_xico_en_Miami__Florida.pdf + https://www.gob.mx/sre/prensa/comunicado-no-198) |
| Consulado de México en Milwaukee (`milwaukee`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389619/27.Consulado_de_M_xico_en_Milwaukee.pdf) |
| Consulado de México en New Brunswick (`new-brunswick`) | 2026-08-22 | [SRE source](https://portales.sre.gob.mx/directorio/consulados-de-mexico-en-el-exterior/new-brunswick) |
| Consulado General de México en Nogales (`nogales`) | 2023-12-15 | [SRE source](https://web.archive.org/web/20231215060909/https://consulmex.sre.gob.mx/nogales/index.php/consulado/circunscripcion) |
| Consulado de Carrera de México en Nueva Orleans (`nueva-orleans`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389617/29.Consulado_de_Carrera_de_M_xico_en_Nueva_Orleans.pdf) |
| Consulado General de México en Nueva York (`nueva-york`) | 2024-12-23 | [SRE source](https://web.archive.org/web/20241223id_/https://consulmex.sre.gob.mx/nuevayork/index.php/espanol/info-consulado/circunscripcion) |
| Consulado de Carrera de México en Oklahoma City (`oklahoma-city`) | 2026-08-22 | [SRE source](https://consulmex.sre.gob.mx/oklahoma/index.php/el-consulado) |
| Consulado de Carrera de México en Omaha (`omaha`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389615/31.Consulado_de_Carrera_de_M_xico_en_Omaha.pdf) |
| Consulado de México en Orlando (`orlando`) | 2022-06-01 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389614/32.Consulado_de_M_xico_en_Orlando.pdf + https://www.gob.mx/sre/prensa/comunicado-no-198) |
| Consulado de México en Oxnard (`oxnard`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389613/33.Consulado_de_M_xico_en_Oxnard.pdf) |
| Consulado General de México en Phoenix (`phoenix`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389612/34.Consulado_General_de_M_xico_en_Phoenix.pdf) |
| Consulado de México en Portland (`portland`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389610/35.Consulado_de_M_xico_en_Portland.pdf) |
| Consulado de Carrera de México en Presidio (`presidio`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389609/36.Consulado_de_Carrera_de_M_xico_en_Presidio.pdf) |
| Consulado General de México en Raleigh (`raleigh`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389607/37.Consulado_General_de_M_xico_en_Raleigh.pdf) |
| Consulado General de México en Sacramento (`sacramento`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389606/38.Consulado_General_de_M_xico_en_Sacramento.pdf) |
| Consulado de México en Saint Paul (`saint-paul`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389605/39.Consulado_de_M_xico_en_Saint_Paul.pdf) |
| Consulado de México en Salt Lake City (`salt-lake-city`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389604/40.Consulado_de_M_xico_en_Salt_Lake_City.pdf) |
| Consulado General de México en San Antonio (`san-antonio`) | 2025-03-24 | [SRE source](https://web.archive.org/web/20250420id_/https://consulmex.sre.gob.mx/sanantonio/index.php/acerca-2/circunscripcion) |
| Consulado de México en San Bernardino (`san-bernardino`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389602/42.Consulado_de_M_xico_en_San_Bernardino.pdf) |
| Consulado General de México en San Diego (`san-diego`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389601/43.Consulado_General_de_M_xico_en_San_Diego.pdf) |
| Consulado General de México en San Francisco (`san-francisco`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389597/44.Consulado_General_de_M_xico_en_San_Francisco.pdf) |
| Consulado General de México en San José (`san-jose`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389596/45.Consulado_General_de_M_xico_en_San_Jos_.pdf) |
| Consulado General de México en San Juan, Puerto Rico (`san-juan`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389595/46.Consulado_General_de_M_xico_en_San_Juan__Puerto_Rico.pdf) |
| Consulado de Carrera de México en Santa Ana (`santa-ana`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389594/47.Consulado_de_Carrera_de_M_xico_en_Santa_Ana.pdf) |
| Consulado de México en Seattle (`seattle`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389592/48.Consulado_de_M_xico_en_Seattle.pdf) |
| Consulado de México en Tucson (`tucson`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389591/49.Consulado_de_M_xico_en_Tucson.pdf) |
| Sección Consular de la Embajada de México en Washington, D.C. (`washington`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389589/51.Secci_n_Consular_de_la_Embajada_de_M_xico_en_Washington__D.C.pdf) |
| Consulado de Carrera de México en Yuma (`yuma`) | 2018-09-12 | [SRE source](https://www.gob.mx/cms/uploads/attachment/file/389590/50.Consulado_de_Carrera_de_M_xico_en_Yuma.pdf) |
