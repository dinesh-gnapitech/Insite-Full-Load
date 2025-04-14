import pandas as pd

def run_etl_for_table(mssql_conn, pg_conn, table_config, chunk_size, logger):
    try:
        mssql_cursor = mssql_conn.cursor()
        pg_cursor = pg_conn.cursor()

        query = table_config["join_query"]
        target_schema = table_config["target_schema"]
        target_table = table_config["target_table"]
        full_target = f"{target_schema}.{target_table}"

        logger.info(f"Running query for table: {full_target}")
        mssql_cursor.execute(query)

        columns = [desc[0] for desc in mssql_cursor.description]

        rows_fetched = 0
        while True:
            rows = mssql_cursor.fetchmany(chunk_size)
            if not rows:
                break
            df = pd.DataFrame(rows, columns=columns)

            placeholders = ', '.join(['%s'] * len(columns))
            column_list = ', '.join(columns)
            insert_sql = f"INSERT INTO {full_target} ({column_list}) VALUES ({placeholders})"

            for row in df.itertuples(index=False, name=None):
                pg_cursor.execute(insert_sql, row)

            pg_conn.commit()
            rows_fetched += len(rows)
            logger.info(f"Inserted {rows_fetched} rows into {full_target}")

        logger.info(f"✅ Completed ETL for {full_target}")

    except Exception as e:
        logger.error(f"❌ ETL failed for {full_target}: {e}")
        raise
