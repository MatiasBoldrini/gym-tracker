"use client";

import React from 'react';
import Picker from 'react-mobile-picker';

interface IOSPickerProps {
    value: { [key: string]: string | number };
    onChange: (value: { [key: string]: string | number }, key: string) => void;
    selections: {
        [key: string]: (string | number)[];
    };
}

export const IOSPicker = ({ value, onChange, selections }: IOSPickerProps) => {
    return (
        <div className="ios-picker-container w-full h-[200px] overflow-hidden">
            <Picker value={value} onChange={onChange} wheelMode="normal">
                {Object.keys(selections).map((key) => (
                    <Picker.Column key={key} name={key}>
                        {selections[key].map((option) => (
                            <Picker.Item key={option} value={option}>
                                {({ selected }) => (
                                    <div className={`text-xl transition-all duration-200 ${selected ? 'text-ios-blue font-bold scale-110' : 'text-gray-400 font-medium'}`}>
                                        {option}
                                    </div>
                                )}
                            </Picker.Item>
                        ))}
                    </Picker.Column>
                ))}
            </Picker>
        </div>
    );
};
