# Priority consular districts

Researched 2026-11-07 using public government sources only. These are service jurisdictions, not legal advice or a guarantee of assistance. Confirm with the consulate.

## Priority metric

[ICE FY2024 annual report](https://www.ice.gov/doclib/eoy/iceAnnualReportFY2024.pdf): removals by **country of citizenship**, October 1, 2023–September 30, 2024. Mexico 87,298; Guatemala 66,435; Honduras 45,923; El Salvador 15,284; Colombia 14,268; Ecuador 12,921. Citizenship is not necessarily removal destination. This is a dated prioritization proxy, not a claim about current rankings. A newer comparable complete official table was not verified.

## Colombia

[Official embassy jurisdiction directory](https://estadosunidos.embajada.gov.co/embajada/concurrencia), with [Miami confirmation](https://miami.consulado.gov.co/ayuda/circunscripcion). Transcribed whole-state assignments and the explicit Miami/Orlando county lists. Normalized obvious Florida spellings Paseo→Pasco and Okechobee→Okeechobee. California is intentionally omitted: north/south descriptions are not county boundaries. Los Angeles and San Francisco polygons therefore show only their verified other-state jurisdictions. Source dates in this addition mean **checked**, not publication or effective dates. Official indexed text was available although direct page access can be blocked.

## Higher-priority research still unresolved

- Guatemala: [MINEX directory](https://www.minex.gob.gt/index.php/din/3128-atencion-consular) contains county spelling/duplication issues and an apparent Houston/McAllen Calhoun (Kalhoun) conflict. No guessed allocation is shipped.
- Honduras and El Salvador: office directories alone do not establish jurisdiction. A complete authoritative partition was not verified in this pass.
- Ecuador: [official directory](https://www.cancilleria.gob.ec/map_maps/estados-unidos/) and individual consular pages provide useful state assignments, but access and completeness require explicit handling rather than geographic inference.

## Reproduction and integrity

Run `python pipeline/scrapers/consular.py --check` then `python pipeline/scrapers/consular.py --built YYYY-MM-DD` with geopandas installed. Inputs are versioned in `pipeline/reference/consular/`. The same Census 2021 county geography as Mexico is used. Undeclared gaps, duplicates and overlaps fail; declared unverified counties are counted in metadata and never rendered. American Samoa, Guam and Northern Mariana Islands remain outside the existing partition. No detention microdata is downloaded or changed by this work.

## Ecuador shipped coverage

The official directory explicitly supplies ten whole-state jurisdictions and the Queens agency’s five New York counties (Richmond, Kings, Queens, Nassau, Suffolk). The general New York consulate entry does not specify jurisdiction: the remaining counties stay unverified, not automatically assigned to it. Puerto Rico and the U.S. Virgin Islands also remain unverified. [Washington](https://www.cancilleria.gob.ec/washington/2022/01/21/contacto/), [Los Angeles](https://www.cancilleria.gob.ec/losangeles/informacion-de-la-mision/), [Houston](https://www.cancilleria.gob.ec/houston/2021/10/01/gestion-del-consulado/) and [Phoenix](https://www.cancilleria.gob.ec/phoenix/2025/03/08/datos-generales-del-consulado/) corroborate individual assignments. Source access limitations are the same as Colombia: indexed official jurisdiction text was available, while direct access sometimes failed. A news report of PR/VI coverage was not substituted for an explicit official assignment.

Colombia’s Pasco spelling is also corroborated by [Decree 2348 of 2015](https://cancilleria.gov.co/normograma/compilacion/docs/decreto_2348_2015.htm).
