import turtle 
import colorsys

t=turtle.Turtle()

t.speed(0)
t.pensize(2)
h=0.5
t.bgcolor('black')
for i in range(150):
    c = colorsys.hls_to_rgb(h, 1, 1)
    t.color(c)
    h+=0.004
    begin_fill()
    t.circle(200-i,100)
    rt(100)
    for j in range(4):
        lt(100)
        rt(20)
        end_fill()
done()
