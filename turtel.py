import turtle

t = turtle.Turtle()
s = turtle.Screen()
s.bgcolor("black")
t.pencolor("dark green")

a = 0
b = 0

t.speed(0)
t.penup()
t.goto(200,200)
t.pendown()

while True:
    t.forward(a)
    t.right(b)
    a+=2
    b+=1
    if  b == 210:
        break
    t.hideturtle()


turtle.done()


