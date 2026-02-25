# Clean up the old broken layer
cd ~
rm -rf lambda_layer langchain_aws_layer.zip

# Recreate with correct platform flags
mkdir -p lambda_layer/python

```bash
pip install \
  langchain-aws \
  langchain-core \
  langchain \
  pymupdf \
  pypdf2 \
  pydantic \
  pydantic-core \
  --target lambda_layer/python \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: \
  --upgrade \
  --quiet
```

# Strip bloat
```bash
find lambda_layer/python -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find lambda_layer/python -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find lambda_layer/python -name "*.dist-info" -type d -exec rm -rf {} + 2>/dev/null || true
```

# Zip
```bash
cd lambda_layer && zip -r9 ../langchain_aws_layer.zip . -q && cd ..
du -sh langchain_aws_layer.zip
```
# Publish as a new version
```bash
aws lambda publish-layer-version \
  --layer-name "langchain-aws-layer" \
  --description "langchain-aws + pydantic-core (linux x86_64)" \
  --zip-file fileb://langchain_aws_layer.zip \
  --compatible-runtimes python3.12 \
  --region us-east-1
```

Then go to your Lambda function → Layers → remove the old layer version and add the new ARN that gets printed. The new version number will be one higher than before (e.g. if you published version 1 before, this will be version 2).

