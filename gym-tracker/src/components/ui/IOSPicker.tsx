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
        <div className="ios-picker-container w-full h-[200px] overflow-hidden relative">
            <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                    background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,1) 100%)'
                }}
            />
            <Picker value={value} onChange={onChange} wheelMode="normal">
                {Object.keys(selections).map((key) => (
                    <Picker.Column key={key} name={key}>
                        {selections[key].map((option) => (
                            <Picker.Item key={option} value={option}>
                                {({ selected }) => (
                                    <div className={`flex items-center justify-center h-[40px] transition-all duration-200 ${selected ? 'text-black font-black text-2xl scale-110' : 'text-gray-300 font-medium text-lg'}`}>
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
