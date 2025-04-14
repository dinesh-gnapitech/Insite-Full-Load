FROM python:3.10-slim

WORKDIR /app

# Install system dependencies required for building C extensions and ODBC, etc.
RUN apt-get update && \
    apt-get install -y \
        curl gnupg2 gcc g++ make \
        unixodbc-dev \
        libxml2-dev libxmlsec1-dev pkg-config \
        libsasl2-dev libldap2-dev \
        libsqlcipher-dev sqlite3 \
        libmemcached-dev zlib1g-dev \
        build-essential && \
    # Add Microsoft SQL Server ODBC driver (ODBC 17)
    curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - && \
    curl https://packages.microsoft.com/config/debian/10/prod.list > /etc/apt/sources.list.d/mssql-release.list && \
    apt-get update && ACCEPT_EULA=Y apt-get install -y msodbcsql17 && \
    rm -rf /var/lib/apt/lists/*

# Copy entire project into the container
COPY . /app

# Upgrade pip and install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Default command: run the ETL using the shell script
CMD ["bash", "deployment/run_etl.sh"]
