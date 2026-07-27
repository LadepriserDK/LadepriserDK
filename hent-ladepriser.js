const { chromium } = require("playwright");
const fs = require("node:fs");

const ADRESSE = "https://ladestandertilelbil.dk/ladepriser";

function danskTid() {
    return new Intl.DateTimeFormat("da-DK", {
        timeZone: "Europe/Copenhagen",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(new Date());
}

async function laesTabel(page) {
    return page.locator("table tbody tr").evaluateAll(rows => {
        function linjer(t){return (t||"").split(/\n+/).map(l=>l.trim()).filter(Boolean);}
        function foersteLinje(t){return linjer(t)[0]||"";}
        function prisSomTal(t){
            const f=foersteLinje(t);
            if(!f||f==="-")return null;
            const m=f.match(/(\d+(?:[.,]\d+)?)/);
            if(!m)return null;
            return Number(m[1].replace(",","."));
        }
        function maerkat(t){
            const ok=["BILLIGST","BILLIG","MIDDEL","DYR","DYREST"];
            return linjer(t).find(l=>ok.includes(l.toUpperCase()))||null;
        }
        return rows.map(row=>{
            const c=[...row.querySelectorAll("td")];
            const u=c[0]?.innerText||"", a=c[1]?.innerText||"",
                  d=c[2]?.innerText||"", ly=c[3]?.innerText||"";
            return {
                udbyder:foersteLinje(u),
                ac:prisSomTal(a), dc:prisSomTal(d), lyn:prisSomTal(ly),
                vurdering:maerkat(ly)||maerkat(d)||maerkat(a)||maerkat(u),
                abonnement:foersteLinje(c[4]?.innerText),
                kilde:c[5]?.querySelector("a")?.href||""
            };
        }).filter(p=>p.udbyder&&p.udbyder!=="Loading...");
    });
}

async function hentPriser() {
    console.log("Starter browseren...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ locale: "da-DK" });

    console.log("Åbner siden med ladepriser...");
    await page.goto(ADRESSE, { waitUntil: "networkidle", timeout: 60000 });

    const opdaterKnap = page.getByRole("button", { name: /opdater/i });
    if (await opdaterKnap.count()) {
        console.log("Trykker på Opdater...");
        await opdaterKnap.first().click().catch(() => {});
    }

    let priser = [];
    for (let forsoeg = 1; forsoeg <= 6; forsoeg++) {
        await page.waitForTimeout(5000);
        priser = await laesTabel(page);
        console.log("Forsøg " + forsoeg + ": " + priser.length + " udbydere fundet.");
        if (priser.length >= 3) break;
    }

    if (priser.length < 3) {
        await browser.close();
        throw new Error("Kunne ikke læse priser fra kilden (fik " + priser.length +
            " rækker). Beholder den eksisterende ladepriser.json.");
    }

    const resultat = {
        hentetUTC: new Date().toISOString(),
        hentetDanskTid: danskTid(),
        hjemmeside: ADRESSE,
        antalUdbydere: priser.length,
        priser
    };
    fs.writeFileSync("ladepriser.json", JSON.stringify(resultat, null, 2), "utf8");
    console.log("\nFærdig. Antal udbydere:", priser.length, "| Tid:", resultat.hentetDanskTid);
    await browser.close();
}

hentPriser().catch(error => {
    console.error("Der opstod en fejl:");
    console.error(error);
    process.exitCode = 1;
});
