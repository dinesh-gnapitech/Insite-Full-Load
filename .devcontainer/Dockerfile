FROM python:3.10-slim

WORKDIR /workspace

# Install system dependencies including headers for pyodbc, etc.
RUN apt-get update && \
    apt-get install -y \
        curl gnupg2 gcc g++ make \
        python3-dev \
        unixodbc-dev \
        libxml2-dev libxmlsec1-dev pkg-config \
        libsasl2-dev libldap2-dev \
        libsqlcipher-dev sqlite3 \
        libmemcached-dev zlib1g-dev \
        build-essential && \
    # Add Microsoft SQL ODBC driver (ODBC 17)
    curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - && \
    curl https://packages.microsoft.com/config/debian/10/prod.list > /etc/apt/sources.list.d/mssql-release.list && \
    apt-get update && ACCEPT_EULA=Y apt-get install -y msodbcsql17 && \
    rm -rf /var/lib/apt/lists/*

# Copy only the necessary files at build time (if needed, otherwise the full workspace is mounted)
COPY requirements.txt .

# Upgrade pip and install dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

CMD ["bash"]
