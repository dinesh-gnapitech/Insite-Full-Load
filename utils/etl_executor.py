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

        # Retrieve column names from the result set metadata
        columns = [desc[0] for desc in mssql_cursor.description]

        rows_fetched = 0
        while True:
            rows = mssql_cursor.fetchmany(chunk_size)
            if not rows:
                break

            # Convert fetched rows into a DataFrame for processing (optional)
            df = pd.DataFrame(rows, columns=columns)

            placeholders = ', '.join(['%s'] * len(columns))
            column_list = ', '.join(columns)
            insert_sql = f"INSERT INTO {full_target} ({column_list}) VALUES ({placeholders})"

            for row in df.itertuples(index=False, name=None):
                try:
                    pg_cursor.execute(insert_sql, row)
                except Exception as e:
                    logger.error(f"Error inserting row {row} into {full_target}: {e}")
                    pg_conn.rollback()
                    raise Exception(f"Insert error for table {full_target}: {e}")

            try:
                pg_conn.commit()
            except Exception as e:
                logger.error(f"Error committing batch insert for {full_target}: {e}")
                pg_conn.rollback()
                raise Exception(f"Commit error for table {full_target}: {e}")

            rows_fetched += len(rows)
            logger.info(f"Inserted {rows_fetched} rows into {full_target}")

        logger.info(f"✅ Completed ETL for {full_target}")

    except Exception as e:
        logger.error(f"❌ ETL failed for {full_target}: {e}")
        raise Exception(f"ETL failed for {full_target}: {e}")
