// adds all created citations into a bibliography formatted in xml -- built for microsoft word upload
// works for a variety of citation styles

const getStyleAttributes = (citation) => {
  const styleAttributes = {
    secondFieldAlign: false,
    hangingIndent: false,
    lineSpacing: false,
    entrySpacing: false,
  };
  if (citation.includes("text-indent: -48px")) {
    styleAttributes.hangingIndent = true;
  }
  const lineHeightMatch = citation.match(/line-height:\s*(\d+(\.\d+)?);/);
  if (lineHeightMatch && lineHeightMatch[1]) {
    styleAttributes.lineSpacing = parseFloat(lineHeightMatch[1]);
  }

  const marginBottomMatch = citation.match(/margin-bottom:\s*(\d+)px;/);
  if (marginBottomMatch && marginBottomMatch[1]) {
    styleAttributes.entrySpacing = parseInt(marginBottomMatch[1], 10);
  }

  if (citation.includes("table")) {
    styleAttributes.secondFieldAlign = "flush";
  }
  return styleAttributes;
};

export const addWorksCited = async (docData, citers, citationStyle) => {
  //this is the xml to be interprested
  let styleAttributes = getStyleAttributes(citers[0].bibliographyCitation);
  console.log("styleattributes", styleAttributes);
  console.log(citers[0]);
  const citationParagraphs = citers
    .map((citation) => {
      let text = citation.bibliographyCitation
        .replace(citation.info && citation.info.annote ? citation.info.annote : '', '') // Remove annotation
        .replace(/<[^>]*>/g, "") // strip HTML tags
        .replace("&nbsp;", " ") // replace &nbsp; with a space
        .replace("&", "&amp;") // replace & with its XML equivalent
        .replace("<", "&lt;") // replace < with its XML equivalent
        .replace(">", "&gt;") // replace > with its XML equivalent
        .replace('"', "&quot;") // replace " with its XML equivalent
        .replace("'", "&apos;"); // replace ' (apostrophe) with its
      let cleanedText = text.trim(); // This removes leading and trailing white spaces and newlines

      let citationNumber = "";
      if (styleAttributes.secondFieldAlign) {
        console.log(cleanedText); // Should now print without leading spaces and newlines
        const citationNumberMatch = cleanedText.match(
          /^(\[\d+\]|\(\d+\)|\d+\.|\d+)/
        );
        if (citationNumberMatch) {
          citationNumber = citationNumberMatch[0];
          text = text.slice(
            text.indexOf(citationNumber) + citationNumber.length
          ); // removes the citation number from the text
        }
      }
      let indentAttr = '<w:ind w:left="720"/>';
      if (styleAttributes.secondFieldAlign === "flush") {
        console.log("passed");
        indentAttr = `<w:ind w:firstLine="0" w:left="360"/>`; // 720 is an example in twips for the left indent
      } else if (styleAttributes.secondFieldAlign === "margin") {
        indentAttr = `<w:ind w:firstLine="0" w:hanging="360"/>`;
      }

      const hangingIndentAttr = styleAttributes.hangingIndent
        ? '<w:ind w:hanging="720"/>'
        : "";
      const lineSpacingAttr = styleAttributes.lineSpacing
        ? `<w:spacing w:line="${styleAttributes.lineSpacing * 240
        }" w:lineRule="auto"/>`
        : "";
      const entrySpacingAttr = styleAttributes.entrySpacing
        ? `<w:spacing w:before="${styleAttributes.entrySpacing * 240
        }" w:after="${entrySpacing * 240}"/>`
        : "";
        function insertSoftBreaks(text, maxLength) {
          const breakChar = '\u200B'; // Zero-width space
          let modifiedText = '';
          while (text.length > 0) {
            let chunk = text.substring(0, maxLength);
            text = text.substring(maxLength);
            modifiedText += chunk + (text.length > 0 ? breakChar : '');
          }
          return modifiedText;
        }
        
        // Usage example for 'text' and 'citation.info.annote'
        text = insertSoftBreaks(text, 40); // 20 is an example chunk size

      return citationNumber
        ? `<w:tbl>
      <w:tblPr>
        <w:tblBorders>
          <w:top w:val="none"/>
          <w:left w:val="none"/>
          <w:bottom w:val="none"/>
          <w:right w:val="none"/>
          <w:insideH w:val="none"/>
          <w:insideV w:val="none"/>
        </w:tblBorders>
        <w:tblLayout w:type="autofit"/>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="750" w:type="dxa"/> <!-- Width for citation number -->
            <w:noWrap/> <!-- Prevent wrapping in this cell -->
          </w:tcPr>
          <w:p><w:r><w:t>${citationNumber}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p>
            <w:pPr>
              ${indentAttr}
              ${hangingIndentAttr}
              ${lineSpacingAttr}
              ${entrySpacingAttr}
            </w:pPr>
            <w:r><w:t>${text}</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
      ${citation.info && citation.info.annote
          ? `<w:tr>
             <w:tc colspan="2"> <!-- This cell spans both columns -->
               <w:p>
                 <w:pPr>
                   <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/> <!-- No additional spacing before or after -->
                 </w:pPr>
                 <w:r><w:t>${citation.info.annote}</w:t></w:r>
               </w:p>
             </w:tc>
           </w:tr>`
          : ""}
    </w:tbl>`
        : `<w:p>
      <w:pPr>
        ${indentAttr}
        ${hangingIndentAttr}
        ${lineSpacingAttr}
        ${entrySpacingAttr}
      </w:pPr>
      <w:r><w:t>${text}</w:t></w:r>
    </w:p>
    ${citation.info && citation.info.annote
          ? `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:t>${citation.info.annote}</w:t></w:r></w:p>`
          : ""}`;

    })
    .join("");

  // Add a page break at the end of the document and a "Work Cited" title.
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const workCitedTitle = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="200" w:after="200"/></w:pPr><w:r><w:t>Works Cited</w:t></w:r></w:p>`;

  docData = docData.replace(
    "</w:body>",
    pageBreak + workCitedTitle + citationParagraphs + "</w:body>"
  );

  return docData;
};

export const replaceInDocument = async (docData, citers) => {
  const createWordXml = (i = false, sup = false, replaced = false) => {
    let attributes =
      '<w:noProof/><w:color w:val="000000"/><w:b w:val="false"/><w:highlight w:val="false"/><w:vertAlign w:val="baseline"/>';
    if (i) {
      attributes =
        '<w:noProof/><w:i/><w:color w:val="000000"/><w:b w:val="false"/><w:highlight w:val="false"/><w:vertAlign w:val="baseline"/>';
      return `</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:rPr>${attributes}</w:rPr><w:t>`;
    }
    if (sup)
      attributes =
        '<w:noProof/><w:vertAlign w:val="superscript"/><w:color w:val="000000"/><w:b w:val="false"/><w:highlight w:val="false"/>';
    return `</w:t></w:r><w:r><w:rPr>${attributes}</w:rPr><w:t>`;
  };
  const handleReplacement = (replacedText) => {
    console.log(replacedText, "sdsd");
    replacedText = replacedText.replace(/<i>/g, "{{i_start}}");
    replacedText = replacedText.replace(/<\/i>/g, "{{i_end}}");
    replacedText = replacedText.replace(/<sup>/g, "{{sup_start}}");
    replacedText = replacedText.replace(/<\/sup>/g, "{{sup_end}}");
    console.log(replacedText, "end");
    return replacedText;
  };
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function generateRegex(searchString) {
    const chars = [...searchString];
    let pattern = chars
      .map((char, index) => {
        const escapedChar = escapeRegex(char);
        // For all characters except the last, match any number of tags and spaces after the character
        return index !== chars.length - 1
          ? `${escapedChar}(?:\\s*<[^>]*>\\s*)*`
          : escapedChar;
      })
      .join("");

    return new RegExp(pattern, "g");
  }

  citers.forEach((citer) => {
    const re = generateRegex(`[${citer.api.string}]`);

    const divContent = citer.inTextCitation.replace(/<\/?span[^>]*>/g, "");
    const wordContent = handleReplacement(divContent);
    docData = docData.replace(
      re,
      `{{replaced_start}}${wordContent}{{replaced_start}}`
    );
  });
  citers.forEach((citer) => {
    const re = generateRegex(`(${citer.api.string})`);

    const divContent = citer.inTextCitation.replace(/<\/?span[^>]*>/g, "");
    const wordContent = handleReplacement(divContent);
    docData = docData.replace(
      re,
      `{{replaced_start}}${wordContent}{{replaced_start}}`
    );
  });
  // Usage
  citers.forEach((citer) => {
    const re = generateRegex(citer.api.string);

    const divContent = citer.inTextCitation.replace(/<\/?span[^>]*>/g, "");
    const wordContent = handleReplacement(divContent);
    docData = docData.replace(
      re,
      `{{replaced_start}}${wordContent}{{replaced_start}}`
    );
  });

  // Usage

  // Now replace HTML tags with Word XML equivalents.
  docData = docData.replace(/{{i_start}}/g, createWordXml(true));
  docData = docData.replace(/{{i_end}}/g, createWordXml());
  docData = docData.replace(/{{sup_start}}/g, createWordXml(false, true));
  docData = docData.replace(/{{sup_end}}/g, createWordXml());
  docData = docData.replace(/{{replaced_start}}/g, createWordXml(false, false));
  docData = docData.replace(/{{replaced_end}}/g, createWordXml());
  return docData;
};
