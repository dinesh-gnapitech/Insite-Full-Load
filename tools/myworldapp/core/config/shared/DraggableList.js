import React, { Component } from 'react';
import { Card, Button } from 'antd';
import { SearchInput } from './FieldEditors/SearchInput';
import { observer } from 'mobx-react';

@observer
export class DraggableList extends Component {
    state = {
        sorting: this.props.sorting,
        filter: ''
    };

    render() {
        //  fixedPosition is set to true when we want to fix this in the bottom right corner of the screen, which is used in the root config pages
        //  Setting it to false will allow it to be used in modals and other dynamically placed locations
        const {
            msg,
            title,
            subTitle,
            ItemComponent,
            SeparatorComponent,
            fixedPosition = true
        } = this.props;
        let { includeSeparator = false, items, extraItems, disabledItems, style = {} } = this.props;

        //Sort the items according to the state and accordingly set the class on the sort button
        let sortBtnClass = 'sort-items';

        if (this.state.sorting === 'asc') {
            items.sort();
            extraItems?.sort();
            sortBtnClass += ' sorting_asc';
        } else if (this.state.sorting === 'desc') {
            items.sort().reverse();
            extraItems?.sort().reverse();
            sortBtnClass += ' sorting_desc';
        }
        items = this.filter(items, this.state.filter);
        if (extraItems) extraItems = this.filter(extraItems, this.state.filter);

        const className = `draggable-list${fixedPosition ? ' fixed-position' : ''}`;

        return (
            <Card
                className={className}
                style={style}
                title={
                    <div>
                        {title}
                        <div style={{ marginTop: '9px' }}>
                            <Button
                                title={msg('sort')}
                                className={sortBtnClass}
                                onClick={this.handleSorting.bind(this)}
                            />
                            <div
                                style={{
                                    display: 'inline-block',
                                    margin: '0 10px',
                                    width: 'calc(100% - 42px)'
                                }}
                            >
                                <SearchInput
                                    value={this.state.filter}
                                    onChange={this.onFilterChange}
                                    onClear={this.onFilterChange}
                                />
                            </div>
                        </div>
                    </div>
                }
            >
                <div style={{ marginBottom: '9px' }}>{subTitle}</div>
                {includeSeparator && (
                    <SeparatorComponent
                        key={'separator_item'}
                        name={'separator'}
                        className={'separator-item'}
                    />
                )}
                <ul className="noStyleList">
                    {items.map((item, index) => (
                        <ItemComponent
                            key={index}
                            index={index}
                            name={item}
                            className={disabledItems?.includes(item) ? 'disabled-items' : ''}
                        />
                    ))}
                </ul>
                {extraItems && (
                    <ul className="noStyleList extra-items">
                        {extraItems.map((item, index) => (
                            <ItemComponent
                                key={index}
                                index={index}
                                name={item}
                                className={disabledItems?.includes(item) ? 'disabled-items' : ''}
                            />
                        ))}
                    </ul>
                )}
            </Card>
        );
    }

    filter(data, filter) {
        if (!filter) return data;
        return data.filter(rec => rec.toLowerCase().includes(filter.toLowerCase()));
    }
    /**
     * Toggles the sorting state
     */
    handleSorting() {
        const { sorting } = this.state;
        this.setState({ sorting: sorting === 'asc' ? 'desc' : 'asc' });
    }

    onFilterChange = value => {
        const filterVal = value ? value : '';
        this.setState({ filter: filterVal });
    };
}
