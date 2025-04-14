################################################################################
# Helper for creating DXF exports
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json, math, io
from osgeo import ogr
import ezdxf
from ezdxf.addons import geo

APP_ID = "IQGEO"


def rgbStrToTuple(col):
    if col[0] == "#":
        col = col[1:]
    return (int("0x" + col[0:2], 0), int("0x" + col[2:4], 0), int("0x" + col[4:6], 0))


class DXFExporter:
    """Encapsulates the format details of DXF for exporting to file."""

    def __init__(self, outputPath=None):
        self.outputPath = outputPath
        self._symbols = None

    @property
    def symbols(self):
        if self._symbols is None:
            # These are copied from SymbolStyle.symbols in our JS code
            self._symbols = {
                "triangle": self.scaleJsSymbolPoints([[50, 100], [0, 0], [100, 0], [50, 100]]),
                "arrow": self.scaleJsSymbolPoints([[50, 100], [15, 0], [85, 0], [50, 100]]),
                "square": self.scaleJsSymbolPoints(
                    [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]
                ),
                "rectangle": self.scaleJsSymbolPoints(
                    [[0, 25], [100, 25], [100, 75], [0, 75], [0, 25]]
                ),
                "cross": self.scaleJsSymbolPoints(
                    [
                        [0, 30],
                        [0, 70],
                        [30, 70],
                        [30, 100],
                        [70, 100],
                        [70, 70],
                        [100, 70],
                        [100, 30],
                        [70, 30],
                        [70, 0],
                        [30, 0],
                        [30, 30],
                        [0, 30],
                    ]
                ),
                "x": self.scaleJsSymbolPoints(
                    [
                        [0, 20],
                        [30, 50],
                        [0, 80],
                        [0, 100],
                        [20, 100],
                        [50, 70],
                        [80, 100],
                        [100, 100],
                        [100, 80],
                        [70, 50],
                        [100, 20],
                        [100, 0],
                        [80, 0],
                        [50, 30],
                        [20, 0],
                        [0, 0],
                        [0, 20],
                    ]
                ),
                "building": self.scaleJsSymbolPoints(
                    [[50, 100], [0, 70], [0, 0], [100, 0], [100, 70], [50, 100]]
                ),
                "diamond": self.scaleJsSymbolPoints(
                    [[50, 0], [100, 50], [50, 100], [0, 50], [50, 0]]
                ),
                "chevron": self.scaleJsSymbolPoints(
                    [[50, 100], [0, 0], [50, 30], [100, 0], [50, 100]]
                ),
            }

            # Define circle here
            refPoint = [0, 100]
            circlePrecision = 20
            points = []
            for i in range(circlePrecision):
                angle = math.radians(360 * i / circlePrecision)
                s = math.sin(angle)
                c = math.cos(angle)
                points.append(
                    [(refPoint[0] * c) - (refPoint[1] * s), (refPoint[0] * s) + (refPoint[1] * c)]
                )

            self._symbols["circle"] = self.scaleJsSymbolPoints(points)

        return self._symbols

    @staticmethod
    def scaleJsSymbolPoints(points):
        newGeom = []
        for point in points:
            newGeom.append([(p - 50) / 2000000 for p in point])
        return newGeom

    def processPointBlock(self, feature_id, feature, styles, geometry):
        geom_style = styles[0]
        text_style = styles[1] if len(styles) >= 2 else None

        base_geom = self.centerGeometry(geometry)
        geoproxy = geo.GeoProxy.parse(base_geom)
        color = geom_style.get("color", "#000000")
        color = rgbStrToTuple(color)
        symbol = geom_style.get("symbol", "circle")
        borderGeometry = self.symbols[symbol]

        newBlock = self.new_dxf.blocks.new(feature_id)

        for point in geoproxy.to_dxf_entities():
            # Create fill / HATCH
            center = point.dxf.location
            translatedGeom = borderGeometry.copy()
            self.translateGeometry(translatedGeom, center)
            hatch = newBlock.add_hatch()
            hatch.set_solid_fill(rgb=color)
            hatch.paths.add_polyline_path(translatedGeom, is_closed=True)

        # Create border / LINE
        # ENH: This is currently broken when rendering in layers, ignore it for now, it also needs converting from gdal to ezdxf
        # with self.newFeature(feature_id) as ogrFeature:
        #    ogrFeature.SetGeometry(borderGeometry)
        #    ogrFeature.SetStyleString('PEN(c:{},w:10px)'.format(geom_style.get('borderColor', color)))

        # Create text / LABEL
        if text_style is not None:
            self.createLabel(feature_id, feature, text_style)

    def processLineStringBlock(self, feature_id, feature, styles, geometry):
        geom_style = styles[0]
        text_style = styles[1] if len(styles) >= 2 else None

        base_geom = self.centerGeometry(geometry)
        geoproxy = geo.GeoProxy.parse(base_geom)
        color = geom_style.get("color", "#FF0000")
        color = rgbStrToTuple(color)
        newBlock = self.new_dxf.blocks.new(feature_id)

        for line in geoproxy.to_dxf_entities():
            line.rgb = color
            line.dxf.const_width = geom_style.get("width", "0")
            newBlock.add_entity(line)

        # Create text / LABEL
        if text_style is not None:
            self.createLabel(feature_id, feature, text_style)

    def processPolygonBlock(self, feature_id, feature, styles, geometry):
        geom_style = styles[0]
        fill_style = styles[1]
        text_style = styles[2] if len(styles) >= 3 else None

        base_geom = self.centerGeometry(geometry)
        geoproxy = geo.GeoProxy.parse(base_geom)
        color = fill_style.get("color", "#000000")
        color = rgbStrToTuple(color)
        newBlock = self.new_dxf.blocks.new(feature_id)

        # Create fill / HATCH
        # ENH: At the moment, the exported hatches are busted when they have holes in
        # for hatch in geoproxy.to_dxf_entities():
        #    hatch.set_solid_fill(rgb=color)
        #    for path in hatch.paths:
        #        path.vertices.append(path.vertices[0])
        #    newBlock.add_entity(hatch)

        # Create line / LINE
        color = geom_style.get("color", "#FF0000")
        color = rgbStrToTuple(color)
        for line in geoproxy.to_dxf_entities(2):
            line.rgb = color
            line.dxf.const_width = geom_style.get("width", "0")
            newBlock.add_entity(line)

        # Create text / LABEL
        if text_style is not None:
            self.createLabel(feature_id, feature, text_style)

    def createLabel(self, feature_id, feature, text_style):
        scale = 0.2 / 10000
        color = text_style.get("color", "#000000")
        color = rgbStrToTuple(color)

        hAlign = text_style.get("hAlign", "center")
        hAlign = 0 if hAlign == "left" else 4 if hAlign == "center" else 2
        vAlign = text_style.get("vAlign", "middle")
        vAlign = 3 if vAlign == "top" else 2 if vAlign == "middle" else 1

        textProp = text_style["textProp"]
        text = feature["properties"].get(textProp, feature_id)
        block = self.new_dxf.blocks.get(feature_id)
        text = block.add_text(text)
        text.font_name = text_style.get("fontFamily", "Arial")
        text.dxf.height = text_style.get("size", 8) * scale
        text.rgb = color
        text.dxf.halign = hAlign
        text.dxf.valign = vAlign

    @staticmethod
    def centerGeometry(geometry):
        geometry_str = json.dumps(geometry)
        borderGeometry = ogr.CreateGeometryFromJson(geometry_str)
        center = borderGeometry.Centroid().GetPoint()
        base_geom = json.loads(geometry_str)
        DXFExporter.translateGeometry(base_geom["coordinates"], center)
        return base_geom

    @staticmethod
    def translateGeometry(coordinates, center):
        for layer in coordinates:
            # Deal with points
            if type(layer) == float:
                coordinates[0] -= center[0]
                coordinates[1] -= center[1]
                return
            elif type(layer[0]) == list:
                DXFExporter.translateGeometry(layer, center)
            else:
                layer[0] -= center[0]
                layer[1] -= center[1]

    # Write feature data to object
    def writeXDATA(self, ref, feature):
        properties = feature["properties"]
        data = []
        for key, val in properties.items():
            formattedVal = val
            if isinstance(formattedVal, str):
                formattedVal = formattedVal.replace("\n", " ")
            data.append((1000, "{}: {}".format(key, formattedVal)))
        ref.set_xdata(APP_ID, data)

    def export(self, data):
        self.new_dxf = ezdxf.new()
        self.new_dxf.appids.add(APP_ID)
        modelspace = self.new_dxf.modelspace()

        # Process the BLOCKS layer
        for feature_id, feature_data in data.items():
            feature = feature_data["feature"]
            feature_type = feature_id.split("/")[0]
            # DXF gets upset if we pass it slashes, which we will have with feature IDs
            feature_id = feature_id.replace("/", "_")
            geometry = feature["geometry"]
            geometry_type = geometry["type"]
            styles = feature_data["styles"]

            if geometry_type in {"Point", "MultiPoint"}:
                self.processPointBlock(feature_id, feature, styles, geometry)

            elif geometry_type in {"LineString", "MultiLineString"}:
                self.processLineStringBlock(feature_id, feature, styles, geometry)

            elif geometry_type in {"Polygon", "MultiPolygon"}:
                self.processPolygonBlock(feature_id, feature, styles, geometry)

            geometry_str = json.dumps(geometry)
            ogrGeometry = ogr.CreateGeometryFromJson(geometry_str)
            center = ogrGeometry.Centroid()
            ref = modelspace.add_blockref(
                feature_id, center.GetPoint_2D(), dxfattribs={"layer": feature_type}
            )
            self.writeXDATA(ref, feature)

        # Output everything
        if self.outputPath is None:
            out = io.StringIO()
            self.new_dxf.write(out)
            out.seek(0)
            return out.read()
        else:
            self.new_dxf.saveas(self.outputPath)
            with open(self.outputPath, "rb") as f:
                return f.read()
