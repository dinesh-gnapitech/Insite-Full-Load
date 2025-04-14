import React, { Component } from 'react';
import { SelectWithInput } from '../../../shared';

const typeViewerMapping = {
    string: [
        'myw.HtmlFieldViewer',

        'myw.BarcodeCode39FieldViewer',
        'myw.BarcodeCode93FieldViewer',
        'myw.BarcodeCode128FieldViewer',
        'myw.BarcodeEAN8FieldViewer',
        'myw.BarcodeEAN13FieldViewer',
        'myw.BarcodeRSS14FieldViewer',
        'myw.BarcodeITF14FieldViewer',

        'myw.BarcodeAztecFieldViewer',
        'myw.BarcodeDataMatrixFieldViewer',
        'myw.BarcodePDF417CodeFieldViewer',
        'myw.BarcodeQRCodeFieldViewer'
    ],
    date: ['myw.DateFieldViewer', 'myw.DateRawFieldViewer'],
    timestamp: [
        'myw.TimeFieldViewer',
        'myw.TimeRawFieldViewer',
        'myw.DateFieldViewer',
        'myw.DateRawFieldViewer'
    ],
    reference_set: [
        'myw.RelatedFeaturesListViewer',
        'myw.AttachmentsListViewer',
        'myw.AttachmentsWallViewer'
    ]
};

//Class to display a select box with a list of field viewers (except default) compatible with the field type
export class FieldViewerSelect extends Component {
    render() {
        const { type } = this.props.data;
        const items = typeViewerMapping[type?.split('(')[0]] || [];

        return (
            <SelectWithInput
                {...this.props}
                items={items}
                className={'field-editor-select'}
            ></SelectWithInput>
        );
    }
}
