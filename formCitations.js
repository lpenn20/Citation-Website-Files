import { sourceTypeInputFields } from "@library/inputFields";
import Cite from "citation-js";

export const fetchFormCitations = async (citers, projectSettings) => {
  if (!projectSettings) {
    const projectSettingsString = localStorage.getItem("projectSettings");
    projectSettings = projectSettingsString
      ? JSON.parse(projectSettingsString)
      : null;
  }
  const { citationStyle, fontFamily, fontSize } = projectSettings;
  await fetchAndConfigureStyle(citationStyle);
  let included = citers.filter((citer) => citer.info);
  let excluded = citers.filter((citer) => !citer.info);
  if (included.length === 0) {
    return citers;
  }

  const citersWithCitation = await Promise.all(
    included.map((citer) =>
      citer.info
        ? formatCitations(citer, citationStyle)
        : Promise.resolve(citer)
    )
  );
  async function addCitationDetails(citers) {
    for (const citer of citers) {
      // Assuming extractAndDetailCitations is a function that takes a citer
      // and returns an object with detailed citation information
      const details = await extractAndDetailCitations(
        citer.bibliographyCitation
      );

      // Add the details as a new property of the citer object
      citer.citationDetails = details;
    }
    return citers;
  }

  // Usage
  const detailedCitations = await addCitationDetails(citersWithCitation);

  const citersWithCitationText = detailedCitations.filter(
    (citer) =>
      citer.citationDetails &&
      citer.citationDetails[0] &&
      citer.citationDetails[0].citationText
  );

  const citersWithoutCitationText = detailedCitations.filter(
    (citer) =>
      !citer.citationDetails ||
      !citer.citationDetails[0] ||
      !citer.citationDetails[0].citationText
  );
  citersWithoutCitationText.forEach((citer) => {
    delete citer.intextCitation;
    delete citer.citationDetails;
    delete citer.bibliographyCitation;
  });
  const fullBibliography = await formatFullBibliography(
    citersWithCitationText,
    citationStyle
  );
  const citersInOrder = sortBibliography(
    fullBibliography,
    citersWithCitationText
  );
  const styledCitations = await applyStylesToCitations(
    citersInOrder,
    citationStyle,
    fontFamily,
    fontSize
  );
  const cleanedStyledCitations = styledCitations.map((citation) => {
    const { citationDetails, ...rest } = citation; // Destructure to remove citationDetails
    return rest;
  });
  return [...excluded, ...citersWithoutCitationText, ...cleanedStyledCitations];
};
const fetchStyleXML = async (citationStyle) => {
  const zoteroCSLUrl = `https://www.zotero.org/styles/${citationStyle}`;
  const responseFromUrl = await fetch(zoteroCSLUrl, { cache: "force-cache" });
  return await responseFromUrl.text();
};

const fetchAndConfigureStyle = async (citationStyle) => {
  const styleXML = await fetchStyleXML(citationStyle);

  const config = Cite.plugins.config.get("@csl");
  if (!config) throw new Error("CSL configuration not found");
  config.templates.add(citationStyle, styleXML);
};

const createNewCiter = (citer) => {
  let newCiter = {};

  sourceTypeInputFields[citer.api.type].basicFields.forEach((fieldArray) => {
    fieldArray.forEach((field) => {
      if (citer.info[field]) {
        newCiter[field] = citer.info[field];
      }
    });
  });

  if (
    citer.api.accessedType &&
    sourceTypeInputFields[citer.api.type][citer.api.accessedType]?.length > 0
  ) {
    sourceTypeInputFields[citer.api.type][citer.api.accessedType].forEach(
      (fieldArray) => {
        fieldArray.forEach((field) => {
          if (citer.info[field]) {
            newCiter[field] = citer.info[field];
          }
        });
      }
    );
  }

  const handleContributors = (contributor) => {
    const role = contributor.role;
    const basicRoles =
      sourceTypeInputFields[citer.api.type].contributorRoles.basic;
    const complexRoles =
      sourceTypeInputFields[citer.api.type].contributorRoles.complex;

    if (basicRoles.includes(role) || complexRoles[role]) {
      if (!newCiter[role]) newCiter[role] = [];
      newCiter[role].push(contributor);
    }
  };

  if (Array.isArray(citer.info.contributor)) {
    citer.info.contributor.forEach(handleContributors);
  }

  return newCiter;
};

const formatFullBibliography = async (citers, citationStyle) => {
  // Sort citers by location before mapping
  citers.sort((a, b) => a.api.location - b.api.location);
  const newCiterArray = citers.map(createNewCiter);
  let citeAll = new Cite(newCiterArray);
  const bibliographyCitationFull = citeAll.format("bibliography", {
    format: "html",
    template: citationStyle,
  });
  return bibliographyCitationFull;
};

const formatCitations = async (citer, citationStyle) => {
  const newCiter = createNewCiter(citer);
  const cite = new Cite(newCiter);
  return {
    ...citer,
    bibliographyCitation: cite.format("bibliography", {
      format: "html",
      template: citationStyle,
    }),
    inTextCitation: cite.format("citation", {
      format: "html",
      template: citationStyle,
    }),
  };
};

function extractAndDetailCitations(bibliography) {
  const detailsArray = [];

  // Create a DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(bibliography, "text/html");

  // Query for elements with class 'csl-entry'
  const entries = doc.querySelectorAll(".csl-entry");

  entries.forEach((entry) => {
    // Extract details
    const leftMarginDiv = entry.querySelector(".csl-left-margin");
    const rightInlineDiv = entry.querySelector(".csl-right-inline");
    if (leftMarginDiv || rightInlineDiv) {
      detailsArray.push({
        number: leftMarginDiv.innerHTML.trim(),
        citationText: rightInlineDiv?.innerHTML?.trim(),
      });
    } else {
      const citation = entry.innerHTML.trim();
      const numberMatch = citation.match(/^\s*[^a-zA-Z0-9]*(\d+)[^a-zA-Z0-9]*/); // Matches any string that starts with one or more digits followed by a period or whitespace

      if (numberMatch) {
        detailsArray.push({
          number: numberMatch[1], // The matched number
          citationText: citation.slice(numberMatch[0].length).trim(), // The rest of the string after removing the matched number and period/whitespace
        });
      } else {
        detailsArray.push({
          citationText: citation.trim(), // The rest of the string after removing the matched number and period/whitespace
        });
      }
    }
  });

  return detailsArray;
}
function extractNumber(str) {
  const numberMatch = str.match(/^\s*[\[\(\.\s]*(\d+)[\]\)\.\s]*/);
  return numberMatch ? parseInt(numberMatch[1]) : null;
}

function ensureSequential(mainCitationDetails) {
  return mainCitationDetails.every((detail, index) => {
    const number = extractNumber(detail.number || "");
    return number === index + 1;
  });
}

function ensureAllOne(citerDetails) {
  return citerDetails.every((citer) => {
    return citer.citationDetails.every((detail) => {
      const number = extractNumber(detail.number || "");
      return number === 1;
    });
  });
}

function removeNumbersFromDetails(citationDetails) {
  citationDetails.forEach((detail) => {
    delete detail.number;
  });
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]) +
            1;
  return matrix[b.length][a.length];
}

function reorderCiters(mainCitationDetails, citersWithText) {
  const reorderedCiters = [];
  const citersToCheck = [...citersWithText];

  mainCitationDetails.forEach((mainDetail) => {
    let closestMatch = null;
    let closestDifference = Infinity;
    let closestCiterIndex = -1;

    citersToCheck.forEach((citer, citerIndex) => {
      citer.citationDetails.forEach((citerDetail, detailIndex) => {
        const difference = levenshtein(
          citerDetail.citationText,
          mainDetail.citationText
        );
        if (difference <= 2 && difference < closestDifference) {
          closestDifference = difference;
          closestMatch = citer;
          closestCiterIndex = citerIndex;
        }
      });
    });
    if (closestMatch) {
      // Update the citationText and number of citer's citation with that of mainDetail
      closestMatch.citationDetails[0].citationText = mainDetail.citationText;
      if (mainDetail.number) {
        closestMatch.citationDetails[0].number = mainDetail.number;
      }
      reorderedCiters.push(closestMatch);
      citersToCheck.splice(closestCiterIndex, 1);
    }
  });
  // Add any remaining citers that did not match
  reorderedCiters.push(...citersToCheck);
  return reorderedCiters;
}
function sortBibliography(bibliography, citers) {
  const mainCitationDetails = extractAndDetailCitations(bibliography);

  const citersWithText = citers.map((citer) => {
    const citerCitationDetails = extractAndDetailCitations(
      citer.bibliographyCitation
    );
    return {
      ...citer,
      citationDetails: citerCitationDetails,
    };
  });
  if (!ensureSequential(mainCitationDetails) || !ensureAllOne(citersWithText)) {
    removeNumbersFromDetails(mainCitationDetails);
    citersWithText.forEach((citer) =>
      removeNumbersFromDetails(citer.citationDetails)
    );
  }
  return reorderCiters(mainCitationDetails, citersWithText);
}

const applyStylesToCitations = async (
  sources,
  citationStyle,
  fontFamily,
  fontSize
) => {
  const styleXML = await fetchStyleXML(citationStyle);
  function removeLastTwoCharacters(str) {
    // Check if the string is long enough to remove two characters
    if (str.length >= 2) {
      return str.slice(0, -2);
    }
    return str; // Return the original string if it's too short
  }
  fontSize = removeLastTwoCharacters(fontSize);
  // Extract the bibliography tag
  const bibliographyTag = styleXML.match(/<bibliography[^>]*>/)[0];
  // Extract the attributes
  const hangingIndentMatch = bibliographyTag.match(/hanging-indent="([^"]*)"/);
  const hangingIndent = hangingIndentMatch ? hangingIndentMatch[1] : null;

  const secondFieldAlignMatch = bibliographyTag.match(
    /second-field-align="([^"]*)"/
  );
  const secondFieldAlign = secondFieldAlignMatch
    ? secondFieldAlignMatch[1]
    : null;

  const lineSpacingMatch = bibliographyTag.match(/line-spacing="([^"]*)"/);
  const lineSpacing = lineSpacingMatch ? lineSpacingMatch[1] : 1;

  const entrySpacingMatch = bibliographyTag.match(/entry-spacing="([^"]*)"/);
  const entrySpacing = entrySpacingMatch ? entrySpacingMatch[1] : 1;
  
  return sources.map((source) => {
    let citationText = source?.citationDetails[0].citationText;
    const numString = source?.citationDetails[0].number;
    const number = numString ? numString.match(/(\d+)/)[1] : null;
    // Apply formatting based on style attributes
    let styles = [];

    if (secondFieldAlign === "flush" || secondFieldAlign === "margin") {
      function hasLongSequenceWithoutWhitespace(text, length) {
        const regex = new RegExp(`\\S{${length},}`, "g");
        return regex.test(text);
      }
      const widthVar = hasLongSequenceWithoutWhitespace(citationText, 200)
        ? 192
        : 48;
      let spacer = "";
      for (let i = 0; i < entrySpacing; i++) {
        spacer += `<div style="${fontSize}pt; line-height: ${fontSize}pt; font-size: 14pt;">&nbsp;</div>`; // adjust the height as per your requirement
      }

      citationText = ` <table style=" table-layout: fixed; width: 100%; max-width: 6.5in; border-collapse: collapse; font-family: ${fontFamily}; font-size: ${fontSize}pt; ">
      <tr>
          <td style="min-width: .5in; max-width: .5in; width: ${widthVar}px; padding: 0; border: none; vertical-align: top; text-align: left; white-space: nowrap;">${numString}</td>
          <td style="box-sizing: border-box; padding: 0; border: none; max-width: 6in; vertical-align: top; overflow-wrap: break-word; white-space: normal; line-height: 1;">
              <p class="citation" style="width: 100%; max-width: 6in; margin: 0; padding: 0;">${citationText}</p> 
              ${spacer}
          </td>
      </tr>
      
      ${
        source.info && source.info.annote
          ? ` <tr><td colspan="2"><p style="width: 100%; max-width: 6.5in; margin-top: ${fontSize}pt; padding: 0; line-height: 2;">${source.info.annote}</p> </td>
      </tr>`
          : ``
      }
     
  </table>`;
    } else {
      if (hangingIndent === "true") {
        styles.push("text-indent: -48px; padding-left: 48px;");
      }
      if (lineSpacing && lineSpacing !== "0") {
        styles.push(`line-height: ${lineSpacing};`);
      }
      if (entrySpacing) {
        styles.push(
          `margin-bottom: ${
            entrySpacing * fontSize
          }pt; margin-top: -${fontSize}pt;`
        );
      }
      let combinedStyles = styles.join(" ");
      citationText = `<p style="${combinedStyles} font-family: ${fontFamily}; font-size: ${fontSize}pt; padding-top: ${fontSize}pt; ">${citationText}</p>`;
      if (source.info && source.info.annote) {
        const annotationParagraph = `<p style="padding-top: 12pt; margin-top:${fontSize}pt; line-height: 2; ${combinedStyles} font-family: ${fontFamily}; font-size: ${fontSize}pt; ">${source.info.annote}</p>`;
        citationText += annotationParagraph;
      }
    }
    // Update the source object

    // Check if source.info.annotation exists and add a separate paragraph for it

    // Update the source object
    source.bibliographyCitation = citationText;
    if (
      source.inTextCitation ===
      "([CSL STYLE ERROR: reference with no printed form.])"
    ) {
      source.inTextCitation = `<span style="font-family: ${fontFamily}; font-size: ${fontSize}pt;">()</span>`;
    } else {
      if (source.inTextCitation.includes("1") && number) {
        source.inTextCitation = source.inTextCitation.replace(/\b1\b/g, number);
      }
      source.inTextCitation = `<span style="font-family: ${fontFamily}; font-size: ${fontSize}pt;">${source.inTextCitation.replace(
        /\n/g,
        ""
      )}</span>`;
    }

    return source;
  });
};
