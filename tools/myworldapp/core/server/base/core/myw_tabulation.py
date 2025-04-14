################################################################################
# Helper class to print columnar data
################################################################################
# Copyright: IQGeo Limited 2010-2023


class MywTableFormatter:
    """
    Helper class to format column-aligned data

    Supports output of selected columns from an ordered list of dicts."""

    layouts = ["columns", "keys", "records", "csv"]

    def __init__(self, *col_defs):
        """
        Build a formatter that will output columns defined by COL_DEFS

        Each COL_DEF is a string or vector (see .addColumn())"""

        self.cols = []
        self.col_headings = {}
        self.col_formats = {}

        for col_def in col_defs:
            self.addColumn(col_def)

    def addColumn(self, col_def):
        """
        Add a column to self

        COL_DEF is one of:
         <col_name>
         [ <col_name>,<col_heading> ]
         [ <col_name>,<col_heading>,<col_format> ]

        where <col_format> is a maximum column width or python format string e.g. "{:7.2f}m" """

        # Canonicalise arg
        if not isinstance(col_def, list):
            col_def = [col_def, col_def]

        if len(col_def) < 3:
            col_def.append(None)

        # Add definition to self
        col = col_def[0]
        self.cols.append(col)
        self.col_headings[col] = col_def[1]
        self.col_formats[col] = col_def[2]

    def format(self, rows, layout="columns", max_val_len=None):
        """
        Format data ROWS (a list of dicts)

        Returns a list of strings"""

        self.max_val_len = max_val_len

        if layout == "records":
            return self.formatAsRecords(rows)
        elif layout == "keys":
            return self.formatAsKeys(rows)
        elif layout == "columns":
            return self.formatAsColumns(rows)
        elif layout == "csv":
            return self.formatAsCsv(rows)
        else:
            raise Exception("Bad value for layout: " + layout)

    def formatAsRecords(self, rows):
        """
        Format dicts ROWS as a list of tables of form:
            <col1>: <value1>
            <col2>: <value2>
        """

        max_val_len = self.max_val_len or 150
        lines = []

        for row in rows:

            for col in self.cols:
                val = self.getValue(row, col)

                if val is not None and val != "":
                    line = "{:25}: {}".format(
                        self.col_headings[col], self.formatValue(col, val, max_val_len)
                    )
                    lines.append(line)

            lines.append("")

        return lines

    def formatAsKeys(self, rows):
        """
        Format dicts ROWS as a list of lines of form:
             <value1>  <col2>=<value2>  <col3>=<value3>"""

        max_val_len = self.max_val_len or 150
        lines = []

        for row in rows:
            line = ""
            first = True

            # Build line
            for col in self.cols:
                val = self.getValue(row, col)

                if val is not None and val != "":

                    line += "  "
                    if first:
                        line += "{}".format(val)
                    else:
                        line += "{}={}".format(
                            self.col_headings[col], self.formatValue(col, val, max_val_len)
                        )

                    first = False

            # Add it to list
            lines.append(line)

        return lines

    def formatAsCsv(self, rows):
        """
        Format dicts ROWS as a list of lines in comma-separated value format
        """

        lines = []

        # Added heading line
        line = ""
        sep = ""
        for col in self.cols:
            heading = self.col_headings[col]
            line += "{}{}".format(sep, heading)
            sep = ","
        lines.append(line)

        # Add data lines
        for row in rows:
            line = ""
            sep = ""

            # Build line
            for col in self.cols:
                val = self.getValue(row, col)

                if val is None:
                    val = ""
                else:
                    val = self.formatValue(col, val, for_csv=True)

                line += "{}{}".format(sep, val)
                sep = ","

            # Add it to list
            lines.append(line)

        return lines

    def formatAsColumns(self, rows):
        """
        Format dicts ROWS as aligned colum data (with headings)
        """

        max_val_len = self.max_val_len or 70

        # Get column default properties
        col_widths = {}
        col_justs = {}
        for col in self.cols:
            col_widths[col] = len(self.col_headings[col])
            col_justs[col] = "right" if self.colIsNumeric(col, rows) else "left"

        # Format values for output (and update column widths)
        row_strs = []
        for row in rows:
            strs = {}

            # For each column in row ..
            for col in self.cols:

                # Get value
                val = self.getValue(row, col)
                if val is None:
                    continue

                # Format value for output
                val_str = self.formatValue(col, val, max_val_len)
                strs[col] = val_str

                # Update width
                col_widths[col] = max(col_widths[col], len(val_str))

            row_strs.append(strs)

        # Build table
        lines = []

        lines.append(self.formatColumns(self.col_headings, col_widths))
        lines.append(self.formatColumns({}, col_widths, "-"))

        for strs in row_strs:
            lines.append(self.formatColumns(strs, col_widths, " ", col_justs))

        return lines

    def formatColumns(self, col_strs, col_widths, pad_ch=" ", col_justs={}):
        """
        Construct a line of a column-aligned table

        COL_STRS gives the value for each column (as
        string). COL_WIDTHS gives the column widths. COL_JUSTS gives
        optional column justifications (keyed by column no)."""

        padded_strs = []

        for col in self.cols:
            width = col_widths[col]
            just = col_justs.get(col, "left")

            val_str = col_strs.get(col, "-")
            if val_str == "":
                val_str = "-"

            padded_strs.append(self.padString(val_str, width, just, pad_ch))

        return "  ".join(padded_strs).rstrip()

    def padString(self, str, width, just, pad_ch):
        """
        Justify a string
        """

        if just == "left":
            return str.ljust(width, pad_ch)

        if just == "right":
            return str.rjust(width, pad_ch)

        n_before = (width - len(str)) / 2
        n_after = width - (n_before + 1)
        return n_before * pad_ch + str + n_after * pad_ch

    def colIsNumeric(self, col, rows):
        """
        True if column COL of ROWS contains numeric data
        """

        for row in rows:
            val = self.getValue(row, col)

            if val is None:
                continue

            if not isinstance(val, (int, float, complex)):  # TODO: Add decimal?
                return False

        return True

    def getValue(self, obj, col):
        """
        Get value of column COL from OBJ (if present)
        """

        # Get value
        if hasattr(obj, "get"):
            val = obj.get(col)
        elif hasattr(obj, "__getitem__"):
            val = obj[col]
        else:
            val = getattr(obj, col)

        return val

    def formatValue(self, col, val, max_str_len=None, for_csv=False):
        """
        Format VAL as a string, using format specified in column definition

        If FOR_CSV is true, also escape things that would break CSV format"""

        csv_reps = {"\n": r"\n", '"': '""'}

        format_str = self.col_formats[col]

        # Heck to override max_str_len
        if isinstance(format_str, int):
            max_str_len = format_str
            format_str = None

        # Truncate very long strings (for readability)
        if max_str_len and not format_str:
            if isinstance(val, str) and len(val) > max_str_len:
                val = val[0 : max_str_len - 3] + "..."

        # Convert to a string
        if format_str:
            val = format_str.format(val)
        else:
            val = str(val)

        if for_csv:
            # Escape characters that would break CSV
            val = str(val)

            for char, rep in list(csv_reps.items()):
                val = val.replace(char, rep)

            if "," in val:
                val = '"' + val + '"'

        else:
            # Convert newlines to '\n'
            val = str(val).replace("\n", "\\n")

        return val
