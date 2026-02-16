from typing import Dict, List, Any
from docling.document_converter import DocumentConverter

# Docling item types (used to interpret layout structure)
from docling_core.types.doc import SectionHeaderItem, TextItem
from langchain_core.documents import Document


class StatePageProcessor:
    """
    Processor for NAIC State Page (STxxx) documents.

    Output:
        {
            "explanations": List[Document],   # narrative chunks → embed
            "records": List[dict]             # structured rows → store
        }
    """

    def __init__(self):
        self.converter = DocumentConverter()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process(self, pdf_path: str) -> Dict[str, Any]:
        """
        Main entrypoint.
        """
        result = self.converter.convert(pdf_path)
        doc = result.document

        explanations = self._extract_explanations(doc, pdf_path)
        records = self._extract_table_records(doc, pdf_path)

        return {"explanations": explanations, "records": records}

    # ------------------------------------------------------------------
    # Narrative Extraction (SectionHeaderItem-driven)
    # ------------------------------------------------------------------

    def _extract_explanations(self, doc, pdf_path: str) -> List[Document]:
        """
        Extract explanatory prose sections using Docling semantic headers.
        """

        explanations: List[Document] = []

        current_section = None
        buffer: List[str] = []

        for item, _level in doc.iterate_items():
            # ---- Detect section headers ----
            if isinstance(item, SectionHeaderItem):
                # Flush previous section
                if current_section and buffer:
                    explanations.append(
                        Document(
                            page_content=" ".join(buffer),
                            metadata={
                                "section_title": current_section,
                                "content_type": "state_page_explanation",
                                "source": pdf_path,
                            },
                        )
                    )
                    buffer = []

                header_text = item.text.strip()

                # Skip repeated running title headers
                if "MODEL BILL" in header_text.upper():
                    current_section = None
                    continue

                current_section = header_text
                continue

            # ---- Accumulate paragraph text ----
            if isinstance(item, TextItem) and current_section:
                text = item.text.strip()

                if len(text) > 40:
                    buffer.append(text)

        # Flush final section
        if current_section and buffer:
            explanations.append(
                Document(
                    page_content=" ".join(buffer),
                    metadata={
                        "section_title": current_section,
                        "content_type": "state_page_explanation",
                        "source": pdf_path,
                    },
                )
            )

        return explanations

    # ------------------------------------------------------------------
    # Structured Table Extraction
    # ------------------------------------------------------------------
    def _extract_table_records(self, doc, pdf_path: str):

        records = []

        for table in doc.tables:
            flat_cells = None

            # Get flattened payload
            for kind, payload in table.data:
                if kind == "table_cells":
                    flat_cells = payload
                    break

            if not flat_cells:
                continue

            headers = []
            header_len = 0

            for cell in flat_cells:
                if getattr(cell, "column_header", False):
                    headers.append(cell.text.strip())
                    header_len += 1
                else:
                    break  # first non-header = start of data

            if header_len == 0:
                continue

            data_cells = flat_cells[header_len:]

            values = [(cell.text.strip() if cell.text else "") for cell in data_cells]

            # Rebuild rows using detected column count

            for i in range(0, len(values), header_len):
                row = values[i : i + header_len]

                if len(row) < header_len:
                    continue

                row_dict = dict(zip(headers, row))

                # Require first column (usually jurisdiction)
                first_value = row[0]
                if not first_value:
                    continue

                row_dict["source"] = pdf_path

                records.append(row_dict)

        return records


processor = StatePageProcessor()

data = processor.process("../docs/model-law-state-page-565.pdf")

explanations = data["explanations"]
records = data["records"]

print(len(explanations), "explanation chunks")
print(len(records), "jurisdiction records")
