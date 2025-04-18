################################################################################
# MywArgHelpFormatter
################################################################################
# Copyright: IQGeo Limited 2010-2023

import re as _re

from gettext import gettext as _

from argparse import HelpFormatter, _StoreTrueAction, OPTIONAL, ZERO_OR_MORE, SUPPRESS


class MywArgparseHelpFormatter(HelpFormatter):
    """
    Custom formatter for command line tool help

    Extends the default argparse formatter to display enums better etc"""

    def __init__(self, prog, indent_increment=2, max_help_position=24, width=120):
        """
        Init slots of self

        Subclassed to make args column wider (MAX_HELP_POSITION parameter)"""

        HelpFormatter.__init__(self, prog, indent_increment, max_help_position, width)

    def _format_usage(self, usage, actions, groups, prefix):
        """
        Build usage string

        Subclassed to present position args before optional"""

        # Cut-and-paste from argparse.py. See MYW tags for changes

        if prefix is None:
            prefix = _("usage: ")

        # if usage is specified, use that
        if usage is not None:
            usage = usage % dict(prog=self._prog)

        # if no optionals or positionals are available, usage is just prog
        elif usage is None and not actions:
            usage = "%(prog)s" % dict(prog=self._prog)

        # if optionals and positionals are available, calculate usage
        elif usage is None:
            prog = "%(prog)s" % dict(prog=self._prog)

            # split optionals from positionals
            optionals = []
            positionals = []
            for action in actions:
                if action.option_strings:
                    optionals.append(action)
                else:
                    positionals.append(action)

            # build full usage string
            format = self._format_actions_usage
            action_usage = format(optionals + positionals, groups)
            action_usage = format(positionals + optionals, groups)
            usage = " ".join([s for s in [prog, action_usage] if s])

            # wrap the usage parts if it's too long
            text_width = self._width - self._current_indent
            if len(prefix) + len(usage) > text_width:

                # break usage into wrappable parts
                part_regexp = r"\(.*?\)+|\[.*?\]+|\S+"
                opt_usage = format(optionals, groups)
                pos_usage = format(positionals, groups)
                opt_parts = _re.findall(part_regexp, opt_usage)
                pos_parts = _re.findall(part_regexp, pos_usage)
                assert " ".join(opt_parts) == opt_usage
                assert " ".join(pos_parts) == pos_usage

                # helper for wrapping lines
                def get_lines(parts, indent, prefix=None):
                    lines = []
                    line = []
                    if prefix is not None:
                        line_len = len(prefix) - 1
                    else:
                        line_len = len(indent) - 1
                    for part in parts:
                        if line_len + 1 + len(part) > text_width and line:
                            lines.append(indent + " ".join(line))
                            line = []
                            line_len = len(indent) - 1
                        line.append(part)
                        line_len += len(part) + 1
                    if line:
                        lines.append(indent + " ".join(line))
                    if prefix is not None:
                        lines[0] = lines[0][len(indent) :]
                    return lines

                # if prog is short, follow it with optionals or positionals
                if len(prefix) + len(prog) <= 0.75 * text_width:
                    indent = " " * (len(prefix) + len(prog) + 1)
                    # MYW: START
                    # if opt_parts:
                    #    lines = get_lines([prog] + opt_parts, indent, prefix)
                    #    lines.extend(get_lines(pos_parts, indent))
                    # elif pos_parts:
                    #    lines = get_lines([prog] + pos_parts, indent, prefix)
                    if pos_parts:
                        lines = get_lines([prog] + pos_parts, indent, prefix)
                        lines.extend(get_lines(opt_parts, indent))
                    elif opt_parts:
                        lines = get_lines([prog] + opt_parts, indent, prefix)
                    # MYW: END
                    else:
                        lines = [prog]

                # if prog is long, put it on its own line
                else:
                    indent = " " * len(prefix)
                    parts = opt_parts + pos_parts
                    lines = get_lines(parts, indent)
                    if len(lines) > 1:
                        lines = []
                        # MYW: START
                        # lines.extend(get_lines(opt_parts, indent))
                        # lines.extend(get_lines(pos_parts, indent))
                        lines.extend(get_lines(pos_parts, indent))
                        lines.extend(get_lines(opt_parts, indent))
                        # MYW: END
                    lines = [prog] + lines

                # join lines into usage
                usage = "\n".join(lines)

        # prefix with 'usage:'
        return "%s%s\n\n" % (prefix, usage)

    def _metavar_formatter(self, action, default_metavar):
        """
        Returns proc to format the arg metavar text

        Subclassed to suppress enum values in arg name column (moved to help text instead)"""

        if action.choices is None:
            return HelpFormatter._metavar_formatter(self, action, default_metavar)

        if default_metavar == SUPPRESS:
            result = "operation"
        else:
            result = default_metavar

        def format(tuple_size):
            if isinstance(result, tuple):
                return result
            else:
                return (result,) * tuple_size

        return format

    def _get_help_string(self, action):
        """
        Help string to display for arg ACTION

        Subclassed to append enum values and default value"""

        help = action.help

        # Append enum values (if appropriate)
        if action.choices is not None:
            help += ", one of: " + ", ".join(action.choices)

        # Append default value (if appropriate)
        if "%(default)" not in action.help and not isinstance(action, _StoreTrueAction):
            if action.default not in [SUPPRESS, None, ""]:
                defaulting_nargs = [OPTIONAL, ZERO_OR_MORE]
                if action.option_strings or action.nargs in defaulting_nargs:
                    help += " (default: %(default)s)"

        return help
