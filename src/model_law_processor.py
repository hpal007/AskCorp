import os
import fitz  # PyMuPDF
import json
import re
from pathlib import Path

class ModelLawProcessor:
    def __init__(self,pdf_path,output_dir="../docs/model_law/"):

        self.pdf_path = Path(pdf_path)
        self.output_dir = output_dir
          
        self.TOKEN_PATTERN = re.compile(
        r"(?m)^\s*(Section\s+\d+\.)"
        r"|^\s*([A-Z]\.)"
        r"|^\s*(\(\d+\))\s+(?=[A-Z])"
        r"|^\s*(\([a-z]\))\s+(?=[A-Z])") # Detect ONLY real structural markers (not inline refs) like "Section 1.", "A.", "(1) ", "(a) " at start of lines

    
    def process(self):
    # def parse_model_law(pdf_path, output_path="structured.json"):
        print("Extracting clean body text...")
        raw_text = self.extract_text()

        print("Normalizing paragraphs...")
        clean_text = self.normalize_text(raw_text)

        print("Parsing legal structure...")
        structure = self.parse_legal_structure(clean_text)

        print("Collapsing table of contents...")
        structure = self.collapse_table_of_contents(structure)

        output_path = self.output_dir + self.pdf_path.stem + ".json"
        os.makedirs(self.output_dir, exist_ok=True)
        print("Saving output...")
        with open(output_path, "w") as f:
            json.dump(structure, f, indent=2)

        print(f"Done → {output_path}")


    # STEP 1: Extract BODY TEXT only (remove headers/footers first)
    def extract_text(self):
        doc = fitz.open(self.pdf_path)

        page_texts = []

        for page in doc:
            blocks = page.get_text("blocks")
            height = page.rect.height

            body_lines = []

            for b in blocks:
                x0, y0, x1, y1, text, *_ = b
                
                # Remove header/footer using page geometry (works generically across model laws)
                top_margin = height * 0.08       # top 8% = header zone
                bottom_margin = height * 0.92    # bottom 8% = footer zone

                if y1 < top_margin:
                    continue  # skip header

                if y0 > bottom_margin:
                    continue  # skip footer

                body_lines.append(text)

            page_texts.append("\n".join(body_lines))

        return "\n\n".join(page_texts)


    # STEP 2: Normalize text while preserving legal structure
    def normalize_text(self, text):
        # Fix hyphenated line breaks
        text = re.sub(r"(\w+)-\n(\w+)", r"\1\2", text)

        lines = text.split("\n")
        rebuilt = []

        for line in lines:
            stripped = line.strip()

            if not stripped:
                continue

            # If line starts with a legal marker → keep as new paragraph
            if re.match(r"^(Section\s+\d+\.|[A-Z]\.|\(\d+\)|\([a-z]\))", stripped):
                rebuilt.append("\n" + stripped)
            else:
                # Otherwise merge into previous paragraph
                if rebuilt:
                    rebuilt[-1] += " " + stripped
                else:
                    rebuilt.append(stripped)

        text = "\n".join(rebuilt)

        # Normalize whitespace
        text = re.sub(r"[ \t]+", " ", text)

        return text.strip()



    def classify_level(self,token):
        token = token.strip()

        if token.startswith("Section"):
            return 1
        if re.fullmatch(r"[A-Z]\.", token):
            return 2
        if re.fullmatch(r"\(\d+\)", token):
            return 3
        if re.fullmatch(r"\([a-z]\)", token):
            return 4
        return 0


    # STEP 4: Build hierarchy from legal grammar
    def parse_legal_structure(self, text):
        matches = list(self.TOKEN_PATTERN.finditer(text))

        print("Detected markers:", len(matches))  # debug visibility

        root = []
        stack = []

        for i, match in enumerate(matches):
            token = match.group().strip()

            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)

            content = text[start:end].strip()

            level = self.classify_level(token)

            node = {
                "marker": token,
                "text": content,
                "children": []
            }

            while len(stack) >= level:
                stack.pop()

            if stack:
                stack[-1]["children"].append(node)
            else:
                root.append(node)

            stack.append(node)

        return root

    def collapse_table_of_contents(self, nodes):
        """
        Detect initial flat Section entries and collapse them into a TOC node.
        """

        toc_entries = []
        body_start_index = 0

        for i, node in enumerate(nodes):
            is_flat_section = (
                node["marker"].startswith("Section")
                and len(node["children"]) == 0
                and len(node["text"]) < 200  # TOC entries are short summaries
            )

            if is_flat_section:
                toc_entries.append(node)
            else:
                body_start_index = i
                break

        # If we detected a TOC block, wrap it
        if toc_entries:
            toc_node = {
                "marker": "TOC",
                "text": "Table of Contents",
                "children": toc_entries
            }

            return [toc_node] + nodes[body_start_index:]

        return nodes

if __name__ == "__main__":
    model_pdf = ModelLawProcessor(pdf_path="../docs/model-law-565.pdf")
    model_pdf.process()
