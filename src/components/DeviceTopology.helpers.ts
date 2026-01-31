export const calculatePositions = (count: number) => {
    const centerX = 400;
    const centerY = 200; // Shifted slightly for better fit
    const radiusX = 350;
    const radiusY = 175;

    // Generate dozens of points in a responsive arc or circle
    return Array.from({ length: count }, (_, i) => {
        // Use full circle if count is high, otherwise arc
        const isHighCount = count > 30;
        const angle = isHighCount
            ? (i / count) * 2 * Math.PI
            : (i / (count - 1 || 1)) * Math.PI - Math.PI;

        return {
            x: centerX + Math.cos(angle) * (isHighCount ? radiusX * 0.9 : radiusX),
            y: centerY + Math.sin(angle) * (isHighCount ? radiusY * 0.9 : radiusY)
        };
    });
};
