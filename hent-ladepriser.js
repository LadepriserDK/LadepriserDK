const { chromium } = require("playwright");
const fs = require("node:fs");

const ADRESSE = "https://ladestandertilelbil.dk/ladepriser";

function danskTid() {
    return new Intl.DateTimeFormat("da-DK", {
        timeZone: "Europe/Copenhagen",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(new Date());
}

async function hentPriser() {
    console.log("Starter browseren...");

    const browser = await chromium.launch({
        headless: true
    });

    const page = await browser.newPage({
        locale: "da-DK"
    });

    console.log("Åbner siden med ladepriser...");

    await page.goto(ADRESSE, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await page.waitForTimeout(8000);

    const opdaterKnap = page.getByRole("button", {
        name: /opdater/i
    });

    if (await opdaterKnap.count()) {
        console.log("Trykker på Opdater...");
        await opdaterKnap.first().click().catch(() => {});
        await page.waitForTimeout(8000);
    }

    const priser = await page
        .locator("table tbody tr")
        .evaluateAll(rows => {
            function linjer(tekst) {
                return (tekst || "")
                    .split(/\n+/)
                    .map(linje => linje.trim())
                    .filter(Boolean);
            }

            function foersteLinje(tekst) {
                return linjer(tekst)[0] || "";
            }

            function prisSomTal(tekst) {
                const første = foersteLinje(tekst);

                if (!første || første === "-") {
                    return null;
                }

                const match = første.match(
                    /(\d+(?:[.,]\d+)?)/
                );

                if (!match) {
                    return null;
                }

                return Number(
                    match[1].replace(",", ".")
                );
            }

            function maerkat(tekst) {
                const tilladte = [
                    "BILLIGST",
                    "BILLIG",
                    "MIDDEL",
                    "DYR",
                    "DYREST"
                ];

                return linjer(tekst).find(linje =>
                    tilladte.includes(
                        linje.toUpperCase()
                    )
                ) || null;
            }

            return rows
                .map(row => {
                    const celler =
                        [...row.querySelectorAll("td")];

                    const udbyderTekst =
                        celler[0]?.innerText || "";

                    const acTekst =
                        celler[1]?.innerText || "";

                    const dcTekst =
                        celler[2]?.innerText || "";

                    const lynTekst =
                        celler[3]?.innerText || "";

                    return {
                        udbyder:
                            foersteLinje(udbyderTekst),

                        ac:
                            prisSomTal(acTekst),

                        dc:
                            prisSomTal(dcTekst),

                        lyn:
                            prisSomTal(lynTekst),

                        vurdering:
                            maerkat(lynTekst) ||
                            maerkat(dcTekst) ||
                            maerkat(acTekst) ||
                            maerkat(udbyderTekst),

                        abonnement:
                            foersteLinje(
                                celler[4]?.innerText
                            ),

                        kilde:
                            celler[5]
                                ?.querySelector("a")
                                ?.href || ""
                    };
                })
                .filter(pris =>
                    pris.udbyder &&
                    pris.udbyder !== "Loading..."
                );
        });

    const resultat = {
        hentetUTC: new Date().toISOString(),
        hentetDanskTid: danskTid(),
        hjemmeside: ADRESSE,
        antalUdbydere: priser.length,
        priser
    };

    fs.writeFileSync(
        "ladepriser.json",
        JSON.stringify(resultat, null, 2),
        "utf8"
    );

    console.log("");
    console.log("Færdig.");
    console.log("Antal udbydere:", priser.length);
    console.log("Dansk tidspunkt:", resultat.hentetDanskTid);
    console.log("Filen ladepriser.json er opdateret.");

    await browser.close();
}

hentPriser().catch(error => {
    console.error("Der opstod en fejl:");
    console.error(error);
    process.exitCode = 1;
});
