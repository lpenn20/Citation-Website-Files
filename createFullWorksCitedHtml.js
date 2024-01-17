

import axios from 'axios'

const generateWorksCited = async (sources, citationStyle) => {
    let worksCited = "";
    const zoteroCSLUrl = `https://www.zotero.org/styles/${citationStyle}`;
    let response;
    let microsoftWord = true

    try {
        response = await axios.get(zoteroCSLUrl);
    } catch (error) {
        console.error('Error fetching CSL data:', error);
        return;
    }

    // Get the XML data from the response
    const styleXML = response.data;

    // Extract the bibliography tag
    const bibliographyTag = styleXML.match(/<bibliography[^>]*>/)[0];
    console.log(bibliographyTag)
    // Extract the attributes
    const hangingIndentMatch = bibliographyTag.match(/hanging-indent="([^"]*)"/);
    const hangingIndent = hangingIndentMatch ? hangingIndentMatch[1] : null;

    const secondFieldAlignMatch = bibliographyTag.match(/second-field-align="([^"]*)"/);
    const secondFieldAlign = secondFieldAlignMatch ? secondFieldAlignMatch[1] : null;

    const lineSpacingMatch = bibliographyTag.match(/line-spacing="([^"]*)"/);
    const lineSpacing = lineSpacingMatch ? lineSpacingMatch[1] : null;

    const entrySpacingMatch = bibliographyTag.match(/entry-spacing="([^"]*)"/);
    const entrySpacing = entrySpacingMatch ? entrySpacingMatch[1] : null;

    function getWidthOfString(str) {
        let element = document.createElement('div');  
        element.style.fontFamily = "Arial";
        element.style.fontSize = "12pt";
        element.style.display = "inline-block";
        element.style.visibility = "hidden";
        element.style.position = "absolute";
        element.innerHTML = str;
        document.body.appendChild(element);
        let width = element.offsetWidth;
        document.body.removeChild(element);
        return width;
    }
    function getNumber(citationText) {
        let match = citationText.match(/^[^a-zA-Z“']*[\s]?/);
        let str = match[0];
        return str
    }
    sources.forEach((source) => {

        let citationText = source?.bibliographyCitation?.replace(/\n/g, "");
        citationText = citationText.replace(/<\/?div>/g, '');
        let citationNumber = source?.citationNumber;
        let numWidth = getWidthOfString(getNumber(citationText))
        console.log(citationText)
        console.log(getNumber(citationText))
        // Apply formatting based on style attributes
            if (hangingIndent === 'true' && microsoftWord) {
                // Simulate hanging indent using CSS
                citationText = `<p style="margin-left: 1cm; text-indent: -1cm;">${citationText}<div></div></p>`;
            }
            else{
                if (hangingIndent === 'true'){
                    citationText = `<p style=" margin-left: 1cm; text-indent: -48px; padding-left: 48px;">${citationText}</p>`;
                }
            }
    
            if (lineSpacing && lineSpacing != '0') {
                // Apply line spacing using CSS
                citationText = `<div style="line-height: ${lineSpacing};">${citationText}</div>`;
            }

            if (entrySpacing && entrySpacing != '0') {
                // Apply entry spacing using CSS
                citationText = `<div style="margin: ${entrySpacing}px 0;">${citationText}</div>`;
            }

            if (secondFieldAlign === "flush") {
                // Simulate second-field-align using CSS
                if (getNumber(citationText).includes(' ')){
                    numWidth += 4
                }
                console.log(numWidth)
                citationText = `<p style="margin-left: 1cm; text-indent: -${numWidth}px;">${citationText}<div></div></p>`;
            }

        worksCited += citationText;
    });


    // Apply entry spacing
    if (entrySpacing) {
        worksCited = `<div style="margin: ${entrySpacing}px 0;">${worksCited}</div>`;
    }

    return worksCited;
};

const createFullWorksCitedHtml = async (sources) => {
  const projectSettingsString = localStorage.getItem("projectSettings");
  const projectSettings = projectSettingsString
    ? JSON.parse(projectSettingsString)
    : null;
    const worksCitedRaw = await generateWorksCited(sources, projectSettings.citationStyle);
    const worksCitedHeading = `<div style="font-family: ${projectSettings.font}; font-size: ${projectSettings.fontSize}; font-weight: bold; text-align: center;">Works Cited</div>`;
    const worksCited = `<div style="border: none; margin: 12; padding: 0; border-spacing: 0;font-family: ${projectSettings.font}; font-size: ${projectSettings.fontSize};">${worksCitedRaw}</div>`;

    return `${worksCitedHeading}${worksCited}`;
}

export { createFullWorksCitedHtml };
