const { JSDOM } = require("jsdom");
const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Converts a complex HTML table to JSON with support for:
 * - Multi-row headers (colspan/rowspan)
 * - Metadata extraction (href links)
 * - Data cleaning (removing hidden icon text)
 */
function parseTableToJSON(htmlString) {
    console.log("[parseTableToJSON] Starting table parsing");
    const dom = new JSDOM(htmlString);
    const doc = dom.window.document;
    const table = doc.querySelector("table");

    if (!table) {
        console.error("[parseTableToJSON] No table element found in HTML string");
        throw new Error("No table found.");
    }

    const rows = Array.from(table.querySelectorAll("tr"));
    console.log(`[parseTableToJSON] Found ${rows.length} rows`);
    const headerRows = rows.filter(
        (row) => row.querySelectorAll("th").length > 0,
    );
    const bodyRows = rows.filter(
        (row) => row.querySelectorAll("td").length > 0,
    );

   // console.log(`[parseTableToJSON] Headers rows: ${headerRows.length}, Body rows: ${bodyRows.length}`);

    // --- STEP 1: RESOLVE HEADERS (Handling Rowspan/Colspan) ---
    const headerMatrix = [];
    headerRows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll("th"));
        let colOffset = 0;

        cells.forEach((cell) => {
            const text = cell.textContent.trim().replace(/\s+/g, " ");
            const colspan = parseInt(cell.getAttribute("colspan") || "1");
            const rowspan = parseInt(cell.getAttribute("rowspan") || "1");

            while (
                headerMatrix[rowIndex] &&
                headerMatrix[rowIndex][colOffset]
            ) {
                colOffset++;
            }

            for (let r = 0; r < rowspan; r++) {
                for (let c = 0; c < colspan; c++) {
                    const rIdx = rowIndex + r;
                    const cIdx = colOffset + c;
                    if (!headerMatrix[rIdx]) headerMatrix[rIdx] = [];
                    headerMatrix[rIdx][cIdx] = text;
                }
            }
            colOffset += colspan;
        });
    });

    // Flatten headers: ["Dec-2025", "AUM (Cr)"] -> "Dec-2025_AUM (Cr)"
    const finalHeaders = headerMatrix[0]?.map((_, c) => {
        const path = [];
        for (let r = 0; r < headerMatrix.length; r++) {
            const val = headerMatrix[r][c];
            if (val && !path.includes(val)) path.push(val);
        }
        return path.join("_");
    }) || [];

    //console.log("[parseTableToJSON] Final headers:", finalHeaders);

    // --- STEP 2: PARSE DATA ROWS ---
    const result = bodyRows.map((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const rowData = {};

        cells.forEach((cell, i) => {
            const headerName = finalHeaders[i] || `column_${i}`;

            // Extract HREF if it exists anywhere in the cell
            const linkTag = cell.querySelector("[href]");
            const href = linkTag ? linkTag.getAttribute("href") : null;

            // Extract text: Prioritize <a> text in complex cells to avoid icon junk
            let cleanText = cell.textContent.trim().replace(/\s+/g, " ");
            if (linkTag && cell.querySelectorAll("*").length > 3) {
                cleanText = linkTag.textContent.trim();
            }

            // Structure result: If there is a link, return an object, otherwise a string
            if (href) {
                rowData[headerName] = {
                    text: cleanText,
                    href: href,
                };
            } else {
                rowData[headerName] = cleanText;
            }
        });

        return rowData;
    });

    console.log(`[parseTableToJSON] Successfully parsed ${result.length} data rows`);
    return result;
}

/**
 * Common logic for extracting insights from a URL
 */
async function extractInsightLogic(url, attribute, attributeValue, tagName) {
    console.log(`[extractInsightLogic] Fetching URL: ${url}`);
    const { data: html } = await axios.get(url, {
        timeout: 10000,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
    });
    console.log(`[extractInsightLogic] HTML fetched (${html.length} chars)`);

    if (attribute && attributeValue) {
        console.log(`[extractInsightLogic] Target: ${tagName}[${attribute}="${attributeValue}"]`);
        const dom = new JSDOM(html);
        const document = dom.window.document;
        return fetchDataFromUrl(document, tagName, attribute, attributeValue);
    } else if (attribute) {
        console.log(`[extractInsightLogic] Target attribute: ${attribute}`);
        const $ = cheerio.load(html);
        const element = $(`[${attribute}]`).first();
        return fetchAttributeFromUrl(element, attribute);
    }

    console.log("[extractInsightLogic] No specific target, returning full HTML");
    return { type: "html", data: html };
}

function fetchDataFromUrl(document, tagName, attribute, attributeValue) {
    let selector = tagName
        ? `${tagName}[${attribute}="${attributeValue}"]`
        : `[${attribute}="${attributeValue}"]`;
    console.log(`[fetchDataFromUrl] Using selector: ${selector}`);
    let element = document.querySelector(selector);

    if (element) {
        const elementHtml = element.outerHTML;
        console.log(`[fetchDataFromUrl] Element found (${elementHtml.length} chars)`);
        if (tagName === "table") {
            return { type: "json", data: parseTableToJSON(elementHtml) };
        }
        return { type: "html", data: elementHtml };
    }
    console.error(`[fetchDataFromUrl] Element not found: ${selector}`);
    throw new Error(
        `Element with attribute "${attribute}" and value "${attributeValue}" not found`,
    );
}

function fetchAttributeFromUrl(element, attribute) {
    if (element.length) {
        const attrValue = element.attr(attribute);
        console.log(`[fetchAttributeFromUrl] Attribute "${attribute}" found, value length: ${attrValue?.length || 0}`);
        if (attrValue) {
            try {
                const jsonData = JSON.parse(attrValue);
                console.log("[fetchAttributeFromUrl] Successfully parsed attribute as JSON");
                if (
                    Array.isArray(jsonData) &&
                    jsonData[0] &&
                    jsonData[0][1] &&
                    jsonData[0][1].tableData
                ) {
                    console.log("[fetchAttributeFromUrl] Detected nested tableData structure");
                    return { type: "json", data: jsonData[0][1].tableData };
                }

                return { type: "json", data: jsonData };
            } catch (e) {
                console.warn("[fetchAttributeFromUrl] Attribute value is not valid JSON, returning raw value");
                return {
                    type: "json",
                    data: null,
                    rawValue: attrValue,
                    error: "Could not parse as JSON",
                };
            }
        }
        console.error(`[fetchAttributeFromUrl] Attribute "${attribute}" found but is empty`);
        throw new Error(`Attribute "${attribute}" found but is empty`);
    }
    console.error(`[fetchAttributeFromUrl] Element with attribute "${attribute}" not found`);
    throw new Error(`Element with attribute "${attribute}" not found`);
}
//extractInsightLogic("https://trendlyne.com/fundamentals/financials/1372/TCS/tata-consultancy-services-ltd/","data-stock-insight","","",);
module.exports = { parseTableToJSON, extractInsightLogic };
