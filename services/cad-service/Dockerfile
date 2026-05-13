FROM mambaorg/micromamba:jammy

ARG MAMBA_DOCKERFILE_ACTIVATE=1

# pythonocc-core is conda-forge only — not on PyPI
RUN micromamba install -y -n base -c conda-forge \
    python=3.11 \
    pythonocc-core=7.8.1 \
    && micromamba clean --all --yes

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

ENTRYPOINT ["/usr/local/bin/_entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
