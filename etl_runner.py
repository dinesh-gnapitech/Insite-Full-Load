import os
from utils.config_loader import load_config
from utils.logger import setup_logger
from utils.def_handler import handle_def_file_and_create_table
from utils.db_connections import get_mssql_conn, get_postgres_conn
from utils.etl_executor import run_etl_for_table

def main():
    # Load configuration with error handling
    try:
        config = load_config("config.json")
    except Exception as e:
        print(f"[CRITICAL] Configuration loading failed: {e}")
        return

    logger = setup_logger(config["log_folder"])

    # Establish MSSQL connection
    try:
        mssql_conn = get_mssql_conn(config["source_database"])
    except Exception as e:
        logger.error(f"[CRITICAL] Failed to connect to MSSQL: {e}")
        return

    # Establish PostgreSQL connection
    try:
        pg_conn = get_postgres_conn(config["target_database"])
    except Exception as e:
        logger.error(f"[CRITICAL] Failed to connect to PostgreSQL: {e}")
        if mssql_conn:
            try:
                mssql_conn.close()
            except Exception as close_err:
                logger.error(f"Failed to close MSSQL connection: {close_err}")
        return

    # Process each table configuration
    for table_config in config["tables"]:
        try:
            target_schema = table_config["target_schema"]
            target_table = table_config["target_table"]
            logger.info(f"🚀 Starting ETL for: {target_schema}.{target_table}")

            def_file_name = table_config["def_file_name"]
            source_def_path = os.path.join(config["def_file_folder"]["source_path"], def_file_name)

            # Use the source .def file directly to create the target table
            handle_def_file_and_create_table(
                source_def_path,
                config["target_database"],
                target_table,
                logger
            )

            # Run the ETL process (data extraction and loading)
            run_etl_for_table(
                mssql_conn,
                pg_conn,
                table_config,
                config["chunk_size"],
                logger
            )
        except Exception as e:
            logger.error(f"[ERROR] ETL failed for {target_schema}.{target_table}: {e}")

    # Attempt to close database connections gracefully
    try:
        mssql_conn.close()
    except Exception as e:
        logger.error(f"Failed to close MSSQL connection: {e}")

    try:
        pg_conn.close()
    except Exception as e:
        logger.error(f"Failed to close PostgreSQL connection: {e}")

    logger.info("✅ ETL process completed for all tables.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[CRITICAL] ETL process encountered a critical error: {e}")
