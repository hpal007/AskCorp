from pathlib import Path
from typing import Optional, List, Dict
import time
from pypdf import PdfReader
import re
import pypdfium2 as pdfium
from pathlib import Path
from langchain_core.documents import Document

from docling.document_converter import DocumentConverter


class DocumentProcessor:
    """
    End-to-end processor for NAIC model law PDFs:
        PDF → Markdown → Metadata → LangChain Documents
    """

    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir) if output_dir else None
        self.converter = DocumentConverter()

    def ingest_pdf(self, pdf_path: str, overwrite: bool = True) -> List[Document]:
        pdf_path = Path(pdf_path)

        md_path = self._pdf_to_markdown(pdf_path, overwrite)
        metadata = self._extract_metadata(pdf_path)

        return self._split_model_law(md_path, metadata)

    def _pdf_to_markdown(self, pdf_path: Path, overwrite: bool) -> Path:
        if not pdf_path.exists():
            raise FileNotFoundError(pdf_path)

        out_dir = self.output_dir or pdf_path.parent
        out_dir.mkdir(parents=True, exist_ok=True)

        output_file = out_dir / f"{pdf_path.stem}.md"

        if output_file.exists() and not overwrite:
            return output_file

        start = time.time()
        print(f"[Docling] Converting {pdf_path.name}")

        result = self.converter.convert(str(pdf_path))
        markdown = result.document.export_to_markdown()

        output_file.write_text(markdown, encoding="utf-8")

        print(f"[Docling] Done in {time.time() - start:.2f}s")
        return output_file

    def _extract_metadata(self, pdf_path: Path) -> Dict:
        metadata: Dict = {"source_file": pdf_path.name}

        # ---- Native PDF metadata ----
        reader = PdfReader(str(pdf_path))
        info = reader.metadata

        if info:
            if info.title:
                metadata["pdf_title"] = info.title
            if info.author:
                metadata["author"] = info.author
            if info.creation_date:
                metadata["creation_date"] = str(info.creation_date)

        # ---- First-page header (layout-derived) ----
        header = self._extract_first_page_header(pdf_path)
        metadata.update(header)

        return metadata

    def _extract_first_page_header(self, pdf_path: Path) -> Dict:
        """
        Lightweight capture of the first-page banner/title block.
        No assumptions about model-law format.
        """
        page = pdfium.PdfDocument(str(pdf_path))[0]
        text = page.get_textpage().get_text_range()

        lines = [line.strip() for line in text.splitlines() if line.strip()]

        header_lines = []
        for line in lines:
            # Stop when actual document body begins
            if re.search(r"Table of Contents|Section\s+1", line):
                break

        header_lines.append(line)

        # First line = publication info
        publication = header_lines[0]

        # Remaining uppercase lines usually form the Act title
        title_lines = [line for line in header_lines[1:] if line.isupper()]

        title = " ".join(title_lines)

        return {
            "publication": publication,
            "act_title": title,
        }

    def _split_model_law(self, md_path: Path, base_metadata: Dict) -> List[Document]:
        text = md_path.read_text(encoding="utf-8")
        sections = re.split(r"(?=^##\sSection\s\d+\.)", text, flags=re.MULTILINE)

        documents = []

        for section in sections:
            section = section.strip()
            if len(section) < 80:
                continue

            section_match = re.search(r"Section\s(\d+)", section)

            metadata = base_metadata.copy()
            if section_match:
                metadata["section"] = section_match.group(1)

            documents.append(Document(page_content=section, metadata=metadata))

        return documents


if __name__ == "__main__":
    src_path = "../docs/model-law-565.pdf"
    output_dir = "../docs/markdown/"

    processor = DocumentProcessor(output_dir=output_dir)
    docs = processor.ingest_pdf(src_path)

    print(len(docs))
    print(docs[1])

# MO565
